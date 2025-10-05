import { ComputeBindingMapping } from "babylonjs";

/**
 * WGSL Shader Reflection 工具类
 * 用于自动从 WGSL 代码中提取 binding mappings 信息和默认值
 */
export class WGSLShaderReflection 
{
    /**
     * 从 WGSL 代码中提取 binding mappings
     * @param wgslSource WGSL 源代码
     * @returns binding mappings 对象
     */
    public static ExtractBindings(wgslSource: string): Record<string, { group: number; binding: number }> {
        const bindings: Record<string, { group: number; binding: number }> = {};
        
        // 匹配 @group(X) @binding(Y) var name: type; 模式
        const bindingRegex = /@group\((\d+)\)\s+@binding\((\d+)\)\s+var\s+(\w+):\s*([^;]+);/g;
        let match;
        
        while ((match = bindingRegex.exec(wgslSource)) !== null) {
            const group = parseInt(match[1]);
            const binding = parseInt(match[2]);
            const name = match[3];
            const type = match[4].trim();
            
            bindings[name] = { group, binding };
        }
        
        // 匹配 @group(X) @binding(Y) var<uniform> name: type; 模式
        const uniformBindingRegex = /@group\((\d+)\)\s+@binding\((\d+)\)\s+var<uniform>\s+(\w+):\s*([^;]+);/g;
        
        while ((match = uniformBindingRegex.exec(wgslSource)) !== null) {
            const group = parseInt(match[1]);
            const binding = parseInt(match[2]);
            const name = match[3];
            const type = match[4].trim();
            
            bindings[name] = { group, binding };
        }
        
        return bindings;
    }
    
    /**
     * 从 WGSL 代码中提取 uniform 默认值
     * 支持注释格式：// @default fieldName: value
     * @param wgslSource WGSL 源代码
     * @returns uniform 默认值对象
     */
    public static ExtractUniformDefaults(wgslSource: string): Record<string, any> {
        const defaults: Record<string, any> = {};
        
        // 匹配 // @default fieldName: value 格式的注释
        const defaultRegex = /\/\/\s*@default\s+(\w+):\s*([^\n\r]+)/g;
        let match;
        
        while ((match = defaultRegex.exec(wgslSource)) !== null) {
            const fieldName = match[1].trim();
            const valueStr = match[2].trim();
            
            // 尝试解析不同类型的值
            let value: any;
            
            if (valueStr === 'true' || valueStr === 'false') {
                value = valueStr === 'true';
            } else if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
                value = valueStr.slice(1, -1); // 移除引号
            } else if (!isNaN(Number(valueStr))) {
                value = Number(valueStr);
            } else if (valueStr.startsWith('vec2(') && valueStr.endsWith(')')) {
                // 解析 vec2(x, y)
                const content = valueStr.slice(5, -1);
                const parts = content.split(',').map(p => p.trim());
                if (parts.length === 2) {
                    value = [Number(parts[0]), Number(parts[1])];
                }
            } else if (valueStr.startsWith('vec3(') && valueStr.endsWith(')')) {
                // 解析 vec3(x, y, z)
                const content = valueStr.slice(5, -1);
                const parts = content.split(',').map(p => p.trim());
                if (parts.length === 3) {
                    value = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
                }
            } else if (valueStr.startsWith('vec4(') && valueStr.endsWith(')')) {
                // 解析 vec4(x, y, z, w)
                const content = valueStr.slice(5, -1);
                const parts = content.split(',').map(p => p.trim());
                if (parts.length === 4) {
                    value = [Number(parts[0]), Number(parts[1]), Number(parts[2]), Number(parts[3])];
                }
            } else {
                // 作为字符串处理
                value = valueStr;
            }
            
            defaults[fieldName] = value;
        }
        
        return defaults;
    }
    
    /**
     * 从 WGSL 代码中提取 uniform 结构体信息
     * @param wgslSource WGSL 源代码
     * @returns uniform 结构体信息
     */
    public static ExtractUniformStruct(wgslSource: string): {
        structName: string;
        fields: Array<{
            name: string;
            type: string;
            defaultValue?: any;
        }>;
    } | null {
        // 匹配 struct 定义
        const structRegex = /struct\s+(\w+)\s*\{([^}]+)\}/s;
        const match = structRegex.exec(wgslSource);
        
        if (!match) {
            return null;
        }
        
        const structName = match[1];
        const structBody = match[2];
        
        // 提取字段信息
        const fields: Array<{ name: string; type: string; defaultValue?: any }> = [];
        const fieldRegex = /(\w+):\s*([^,]+),?/g;
        let fieldMatch;
        
        while ((fieldMatch = fieldRegex.exec(structBody)) !== null) {
            const fieldName = fieldMatch[1].trim();
            const fieldType = fieldMatch[2].trim();
            
            fields.push({
                name: fieldName,
                type: fieldType
            });
        }
        
        // 提取默认值
        const defaults = this.ExtractUniformDefaults(wgslSource);
        
        // 将默认值分配给对应字段
        fields.forEach(field => {
            if (defaults[field.name] !== undefined) {
                field.defaultValue = defaults[field.name];
            }
        });
        
        return {
            structName,
            fields
        };
    }
    
    /**
     * 生成 Babylon.js UniformBuffer 初始化代码
     * @param wgslSource WGSL 源代码
     * @returns 初始化代码字符串
     */
    public static GenerateUniformBufferInit(wgslSource: string): string {
        const structInfo = this.ExtractUniformStruct(wgslSource);
        if (!structInfo) {
            return '// 未找到 uniform 结构体';
        }
        
        let code = `// 自动生成的 UniformBuffer 初始化代码\n`;
        code += `const uniformBuffer = new BABYLON.UniformBuffer(engine);\n\n`;
        
        // 添加字段定义
        structInfo.fields.forEach(field => {
            code += `uniformBuffer.addUniform("${field.name}", 1);\n`;
        });
        
        code += `\nuniformBuffer.create();\n\n`;
        
        // 添加默认值设置
        code += `// 设置默认值\n`;
        structInfo.fields.forEach(field => {
            if (field.defaultValue !== undefined) {
                if (Array.isArray(field.defaultValue)) {
                    // 向量类型
                    code += `uniformBuffer.updateFloat4("${field.name}", ${field.defaultValue.join(', ')});\n`;
                } else if (typeof field.defaultValue === 'number') {
                    code += `uniformBuffer.updateFloat("${field.name}", ${field.defaultValue});\n`;
                } else if (typeof field.defaultValue === 'boolean') {
                    code += `uniformBuffer.updateFloat("${field.name}", ${field.defaultValue ? 1.0 : 0.0});\n`;
                } else {
                    code += `uniformBuffer.updateFloat("${field.name}", ${field.defaultValue});\n`;
                }
            }
        });
        
        code += `\nuniformBuffer.update();\n`;
        
        return code;
    }
    
    /**
     * 生成 TypeScript 接口定义
     * @param wgslSource WGSL 源代码
     * @returns TypeScript 接口字符串
     */
    public static GenerateTypeScriptInterface(wgslSource: string): string {
        const structInfo = this.ExtractUniformStruct(wgslSource);
        if (!structInfo) {
            return '// 未找到 uniform 结构体';
        }
        
        let code = `export interface ${structInfo.structName} {\n`;
        
        structInfo.fields.forEach(field => {
            let tsType = 'number';
            
            if (field.type.includes('vec2')) {
                tsType = '[number, number]';
            } else if (field.type.includes('vec3')) {
                tsType = '[number, number, number]';
            } else if (field.type.includes('vec4')) {
                tsType = '[number, number, number, number]';
            } else if (field.type.includes('bool')) {
                tsType = 'boolean';
            }
            
            const defaultValue = field.defaultValue !== undefined ? ` = ${JSON.stringify(field.defaultValue)}` : '';
            code += `    ${field.name}: ${tsType}${defaultValue};\n`;
        });
        
        code += `}\n`;
        
        return code;
    }
    
    /**
     * 验证 binding mappings 的完整性
     * @param wgslSource WGSL 源代码
     * @param bindings 要验证的 binding mappings
     * @returns 验证结果
     */
    public static ValidateBindings(wgslSource: string, bindings: Record<string, { group: number; binding: number }>): {
        isValid: boolean;
        missing: string[];
        extra: string[];
        conflicts: Array<{ name: string; expected: { group: number; binding: number }; actual: { group: number; binding: number } }>;
    } {
        const extractedBindings = this.ExtractBindings(wgslSource);
        const missing: string[] = [];
        const extra: string[] = [];
        const conflicts: Array<{ name: string; expected: { group: number; binding: number }; actual: { group: number; binding: number } }> = [];
        
        // 检查缺失的 bindings
        for (const [name, binding] of Object.entries(extractedBindings)) {
            if (!bindings[name]) {
                missing.push(name);
            } else if (bindings[name].group !== binding.group || bindings[name].binding !== binding.binding) {
                conflicts.push({
                    name,
                    expected: binding,
                    actual: bindings[name]
                });
            }
        }
        
        // 检查多余的 bindings
        for (const name of Object.keys(bindings)) {
            if (!extractedBindings[name]) {
                extra.push(name);
            }
        }
        
        return {
            isValid: missing.length === 0 && conflicts.length === 0,
            missing,
            extra,
            conflicts
        };
    }
    
    /**
     * 从 WGSL 代码中提取所有资源类型信息
     * @param wgslSource WGSL 源代码
     * @returns 资源类型信息
     */
    public static ExtractResourceTypes(wgslSource: string): Array<{
        name: string;
        group: number;
        binding: number;
        type: string;
        isUniform: boolean;
        isStorage: boolean;
        isTexture: boolean;
        isSampler: boolean;
    }> {
        const resources: Array<{
            name: string;
            group: number;
            binding: number;
            type: string;
            isUniform: boolean;
            isStorage: boolean;
            isTexture: boolean;
            isSampler: boolean;
        }> = [];
        
        // 匹配所有 binding 声明
        const bindingRegex = /@group\((\d+)\)\s+@binding\((\d+)\)\s+var(?:<(\w+)>)?\s+(\w+):\s*([^;]+);/g;
        let match;
        
        while ((match = bindingRegex.exec(wgslSource)) !== null) {
            const group = parseInt(match[1]);
            const binding = parseInt(match[2]);
            const qualifier = match[3] || '';
            const name = match[4];
            const type = match[5].trim();
            
            const isUniform = qualifier === 'uniform';
            const isStorage = type.includes('storage');
            const isTexture = type.includes('texture');
            const isSampler = type.includes('sampler');
            
            resources.push({
                name,
                group,
                binding,
                type,
                isUniform,
                isStorage,
                isTexture,
                isSampler
            });
        }
        
        return resources;
    }
    
    /**
     * 生成 Babylon.js ComputeShader 的 bindings 配置
     * @param wgslSource WGSL 源代码
     * @returns Babylon.js 格式的 bindings 配置
     */
    public static GenerateBabylonComputeBindings(wgslSource: string): ComputeBindingMapping {
        const bindings = this.ExtractBindings(wgslSource);
        const computeBindings: ComputeBindingMapping = {};
        for (const [name, binding] of Object.entries(bindings)) {
            computeBindings[name] = {
                group: binding.group,
                binding: binding.binding
            };
        }
        return computeBindings;
    }
    
    /**
     * 从 WGSL 代码中提取 Compute EntryPoint 信息
     * @param wgslSource WGSL 源代码
     * @returns Compute EntryPoint 信息数组
     */
    public static ExtractComputeEntryPoints(wgslSource: string): Array<{
        name: string;
        workgroupSize: {
            x: number;
            y: number;
            z: number;
        };
        workgroupSizeConstants: {
            x?: string;
            y?: string;
            z?: string;
        };
        parameters: Array<{
            name: string;
            type: string;
            builtin?: string;
        }>;
    }> {
        const entryPoints: Array<{
            name: string;
            workgroupSize: {
                x: number;
                y: number;
                z: number;
            };
            workgroupSizeConstants: {
                x?: string;
                y?: string;
                z?: string;
            };
            parameters: Array<{
                name: string;
                type: string;
                builtin?: string;
            }>;
        }> = [];

        // 匹配 compute entrypoint 函数
        // 格式: @compute @workgroup_size(X, Y, Z) fn functionName(...) { ... }
        const computeRegex = /@compute\s+@workgroup_size\(([^)]+)\)\s*\n\s*fn\s+(\w+)/gs;
        let match;

        while ((match = computeRegex.exec(wgslSource)) !== null) {
            const workgroupSizeStr = match[1].trim();
            const functionName = match[2];

            // 解析 workgroup size
            const workgroupSizeParts = workgroupSizeStr.split(',').map(p => p.trim());
            const workgroupSize = {
                x: this.parseWorkgroupSizeValue(workgroupSizeParts[0], wgslSource),
                y: this.parseWorkgroupSizeValue(workgroupSizeParts[1], wgslSource),
                z: this.parseWorkgroupSizeValue(workgroupSizeParts[2], wgslSource)
            };

            // 解析 workgroup size 常量名
            const workgroupSizeConstants = {
                x: this.extractWorkgroupSizeConstant(workgroupSizeParts[0]),
                y: this.extractWorkgroupSizeConstant(workgroupSizeParts[1]),
                z: this.extractWorkgroupSizeConstant(workgroupSizeParts[2])
            };

            // 尝试从完整匹配中提取参数信息
            const fullMatch = match[0];
            const paramMatch = fullMatch.match(/fn\s+\w+\s*\(([^)]*)\)/);
            const parametersStr = paramMatch ? paramMatch[1].trim() : '';

            // 解析函数参数
            const parameters: Array<{ name: string; type: string; builtin?: string }> = [];
            if (parametersStr) {
                const paramRegex = /@builtin\((\w+)\)\s+(\w+):\s*([^,]+)/g;
                let paramMatch;
                while ((paramMatch = paramRegex.exec(parametersStr)) !== null) {
                    parameters.push({
                        name: paramMatch[2],
                        type: paramMatch[3].trim(),
                        builtin: paramMatch[1]
                    });
                }
            }

            entryPoints.push({
                name: functionName,
                workgroupSize,
                workgroupSizeConstants,
                parameters
            });
        }

        return entryPoints;
    }

    /**
     * 解析 workgroup size 值（支持常量和数字）
     * @param valueStr 值字符串
     * @param wgslSource WGSL 源代码
     * @returns 解析后的数值
     */
    private static parseWorkgroupSizeValue(valueStr: string, wgslSource: string): number {
        // 如果是数字，直接返回
        if (!isNaN(Number(valueStr))) {
            return Number(valueStr);
        }

        // 如果是常量，尝试从源代码中查找常量定义
        const constRegex = new RegExp(`const\\s+${valueStr}\\s*=\\s*(\\d+)u?;`, 'g');
        const match = constRegex.exec(wgslSource);
        if (match) {
            return parseInt(match[1]);
        }

        // 默认返回 1
        return 1;
    }

    /**
     * 提取 workgroup size 常量名
     * @param valueStr 值字符串
     * @returns 常量名（如果是常量）或 undefined
     */
    private static extractWorkgroupSizeConstant(valueStr: string): string | undefined {
        // 如果是数字，返回 undefined
        if (!isNaN(Number(valueStr))) {
            return undefined;
        }

        // 如果是常量名，返回常量名
        return valueStr;
    }

    /**
     * 从 WGSL 代码中提取所有常量定义
     * @param wgslSource WGSL 源代码
     * @returns 常量定义对象
     */
    public static ExtractConstants(wgslSource: string): Record<string, number> {
        const constants: Record<string, number> = {};
        
        // 匹配 const 定义
        const constRegex = /const\s+(\w+)\s*=\s*(\d+)u?;/g;
        let match;
        
        while ((match = constRegex.exec(wgslSource)) !== null) {
            const name = match[1];
            const value = parseInt(match[2]);
            constants[name] = value;
        }
        
        return constants;
    }

    /**
     * 生成 Compute EntryPoint 的调试信息
     * @param wgslSource WGSL 源代码
     * @returns 调试信息字符串
     */
    public static GenerateComputeDebugInfo(wgslSource: string): string {
        const entryPoints = this.ExtractComputeEntryPoints(wgslSource);
        const constants = this.ExtractConstants(wgslSource);
        
        let debugInfo = '=== WGSL Compute EntryPoints Debug Info ===\n\n';
        
        debugInfo += 'Constants:\n';
        for (const [name, value] of Object.entries(constants)) {
            debugInfo += `  ${name} = ${value}\n`;
        }
        
        debugInfo += '\nCompute EntryPoints:\n';
        entryPoints.forEach((entryPoint, index) => {
            debugInfo += `  ${index + 1}. ${entryPoint.name}\n`;
            debugInfo += `     Workgroup Size: ${entryPoint.workgroupSize.x} x ${entryPoint.workgroupSize.y} x ${entryPoint.workgroupSize.z}\n`;
            
            if (entryPoint.workgroupSizeConstants.x || entryPoint.workgroupSizeConstants.y || entryPoint.workgroupSizeConstants.z) {
                debugInfo += `     Workgroup Size Constants:\n`;
                if (entryPoint.workgroupSizeConstants.x) debugInfo += `       X: ${entryPoint.workgroupSizeConstants.x}\n`;
                if (entryPoint.workgroupSizeConstants.y) debugInfo += `       Y: ${entryPoint.workgroupSizeConstants.y}\n`;
                if (entryPoint.workgroupSizeConstants.z) debugInfo += `       Z: ${entryPoint.workgroupSizeConstants.z}\n`;
            }
            
            if (entryPoint.parameters.length > 0) {
                debugInfo += `     Parameters:\n`;
                entryPoint.parameters.forEach(param => {
                    const builtinInfo = param.builtin ? ` (@builtin(${param.builtin}))` : '';
                    debugInfo += `       ${param.name}: ${param.type}${builtinInfo}\n`;
                });
            }
            
            debugInfo += '\n';
        });
        
        return debugInfo;
    }

    /**
     * 生成调试信息
     * @param wgslSource WGSL 源代码
     * @returns 调试信息字符串
     */
    public static GenerateDebugInfo(wgslSource: string): string {
        const bindings = this.ExtractBindings(wgslSource);
        const resources = this.ExtractResourceTypes(wgslSource);
        const defaults = this.ExtractUniformDefaults(wgslSource);
        const structInfo = this.ExtractUniformStruct(wgslSource);
        
        let debugInfo = '=== WGSL Shader Reflection Debug Info ===\n\n';
        
        debugInfo += 'Extracted Bindings:\n';
        for (const [name, binding] of Object.entries(bindings)) {
            debugInfo += `  ${name}: group=${binding.group}, binding=${binding.binding}\n`;
        }
        
        debugInfo += '\nResource Types:\n';
        for (const resource of resources) {
            debugInfo += `  ${resource.name}: ${resource.type} (group=${resource.group}, binding=${resource.binding})\n`;
            debugInfo += `    - Uniform: ${resource.isUniform}\n`;
            debugInfo += `    - Storage: ${resource.isStorage}\n`;
            debugInfo += `    - Texture: ${resource.isTexture}\n`;
            debugInfo += `    - Sampler: ${resource.isSampler}\n`;
        }
        
        debugInfo += '\nUniform Defaults:\n';
        for (const [name, value] of Object.entries(defaults)) {
            debugInfo += `  ${name}: ${JSON.stringify(value)}\n`;
        }
        
        if (structInfo) {
            debugInfo += '\nUniform Struct:\n';
            debugInfo += `  Name: ${structInfo.structName}\n`;
            debugInfo += '  Fields:\n';
            structInfo.fields.forEach(field => {
                const defaultValue = field.defaultValue !== undefined ? ` (default: ${JSON.stringify(field.defaultValue)})` : ''; 
                debugInfo += `    ${field.name}: ${field.type}${defaultValue}\n`;
            });
        }
        
        debugInfo += '\nBabylon.js Bindings Configuration:\n';
        debugInfo += JSON.stringify(bindings, null, 2);
        
        return debugInfo;
    }
}



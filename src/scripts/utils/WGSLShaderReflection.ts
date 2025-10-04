import { ComputeBindingMapping } from "babylonjs";

/**
 * WGSL Shader Reflection 工具类
 * 用于自动从 WGSL 代码中提取 binding mappings 信息和默认值
 */
export class WGSLShaderReflection {
    /**
     * 从 WGSL 代码中提取 binding mappings
     * @param wgslSource WGSL 源代码
     * @returns binding mappings 对象
     */
    public static extractBindings(wgslSource: string): Record<string, { group: number; binding: number }> {
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
    public static extractUniformDefaults(wgslSource: string): Record<string, any> {
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
    public static extractUniformStruct(wgslSource: string): {
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
        const defaults = this.extractUniformDefaults(wgslSource);
        
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
    public static generateUniformBufferInit(wgslSource: string): string {
        const structInfo = this.extractUniformStruct(wgslSource);
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
    public static generateTypeScriptInterface(wgslSource: string): string {
        const structInfo = this.extractUniformStruct(wgslSource);
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
    public static validateBindings(wgslSource: string, bindings: Record<string, { group: number; binding: number }>): {
        isValid: boolean;
        missing: string[];
        extra: string[];
        conflicts: Array<{ name: string; expected: { group: number; binding: number }; actual: { group: number; binding: number } }>;
    } {
        const extractedBindings = this.extractBindings(wgslSource);
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
    public static extractResourceTypes(wgslSource: string): Array<{
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
    public static generateBabylonComputeBindings(wgslSource: string): ComputeBindingMapping {
        const bindings = this.extractBindings(wgslSource);
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
     * 生成调试信息
     * @param wgslSource WGSL 源代码
     * @returns 调试信息字符串
     */
    public static generateDebugInfo(wgslSource: string): string {
        const bindings = this.extractBindings(wgslSource);
        const resources = this.extractResourceTypes(wgslSource);
        const defaults = this.extractUniformDefaults(wgslSource);
        const structInfo = this.extractUniformStruct(wgslSource);
        
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



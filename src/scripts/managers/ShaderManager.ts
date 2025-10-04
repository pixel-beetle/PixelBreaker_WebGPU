import * as BABYLON from 'babylonjs';
import videoComputeShader from '../../shaders/video-compute.wgsl';
import { WGSLShaderReflection } from '../utils/WGSLShaderReflection';

export interface ShaderUniforms {
    brightness: number;
    contrast: number;
    saturation: number;
    hueShift: number;
    gamma: number;
}

export class ShaderManager {
    public material!: BABYLON.StandardMaterial;
    private computeShader!: BABYLON.ComputeShader;
    private inputTextureSampler!: BABYLON.TextureSampler;
    private outputTexture!: BABYLON.RawTexture;
    private uniforms: ShaderUniforms;
    private uniformBuffer!: BABYLON.UniformBuffer;

    constructor(
        private scene: BABYLON.Scene,
        private videoTexture: BABYLON.VideoTexture,
        private plane: BABYLON.Mesh,
        private engine: BABYLON.Engine
    ) {
        // 使用反射工具提取默认值
        const defaults = WGSLShaderReflection.extractUniformDefaults(videoComputeShader);
        this.uniforms = {
            brightness: defaults.brightness || 0.0,
            contrast: defaults.contrast || 1.0,
            saturation: defaults.saturation || 1.0,
            hueShift: defaults.hueShift || 0.0,
            gamma: defaults.gamma || 1.0
        };
        
        this.setupComputeShader();
        this.setupMaterial();
    }

    private setupComputeShader(): void {
        // 创建输出纹理
        this.outputTexture = BABYLON.RawTexture.CreateRGBAStorageTexture(
            null, 
            1920, 
            1080, 
            this.scene, 
            false, 
            false, 
            BABYLON.Texture.BILINEAR_SAMPLINGMODE, 
            BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE, false);


        // 创建输入纹理采样器
        this.inputTextureSampler = new BABYLON.TextureSampler();


        // 使用反射工具自动创建 uniform buffer
        this.setupUniformBuffer();

        // 使用反射工具自动提取 binding mappings
        const bindings = WGSLShaderReflection.generateBabylonComputeBindings(videoComputeShader);
        
        // 验证 bindings 是否正确
        const validation = WGSLShaderReflection.validateBindings(videoComputeShader, bindings);
        if (!validation.isValid) {
            console.warn('WGSL Shader Binding Validation Failed:', validation);
            console.log('Debug Info:', WGSLShaderReflection.generateDebugInfo(videoComputeShader));
        }
        
        // 创建 compute shader
        this.computeShader = new BABYLON.ComputeShader("videoCompute", this.engine, 
            { computeSource: videoComputeShader }, 
            { bindingsMapping: bindings }
        );
    }

    private setupUniformBuffer(): void {
        // 创建 uniform buffer
        this.uniformBuffer = new BABYLON.UniformBuffer(this.engine);
        
        // 使用反射工具提取结构体信息
        const structInfo = WGSLShaderReflection.extractUniformStruct(videoComputeShader)!;
        
        
            // 自动添加所有字段
            structInfo.fields.forEach(field => {
                this.uniformBuffer.addUniform(field.name, 1);
            });
            
            this.uniformBuffer.create();
            
            // 使用默认值初始化
            this.initializeWithDefaults();
        
    }

    private initializeWithDefaults(): void {
        // 使用反射工具提取的默认值
        const defaults = WGSLShaderReflection.extractUniformDefaults(videoComputeShader);
        
        // 设置所有默认值
        Object.entries(defaults).forEach(([name, value]) => {
            if (typeof value === 'number') {
                this.uniformBuffer.updateFloat(name, value);
            }
        });
        
        // 更新 uniform buffer
        this.uniformBuffer.update();
        
        console.log('Uniform buffer initialized with defaults:', defaults);
    }

    private setupMaterial(): void {
        // 创建标准材质，使用 compute shader 的输出纹理
        this.material = new BABYLON.StandardMaterial("videoMaterial", this.scene);
        this.material.diffuseTexture = this.outputTexture;
        this.material.emissiveTexture = this.outputTexture;
        this.material.diffuseColor = new BABYLON.Color3(1, 1, 1);
        this.material.emissiveColor = new BABYLON.Color3(1, 1, 1);
        
        // 启用透明度
        this.material.alpha = 1.0;
        
        // 设置材质属性
        this.material.backFaceCulling = false;
        this.material.twoSidedLighting = true;
        
        // 应用到平面
        this.plane.material = this.material;
    }

    public updateUniforms(uniforms: ShaderUniforms): void {
        this.uniforms = { ...uniforms };
        this.executeComputeShader();
    }

    public executeComputeShader(): void {
        if (!this.computeShader || !this.videoTexture) return;
        

        // 更新 uniform buffer
        this.uniformBuffer.updateFloat("time", this.engine.getDeltaTime() * 0.001);
        this.uniformBuffer.updateFloat("brightness", this.uniforms.brightness);
        this.uniformBuffer.updateFloat("contrast", this.uniforms.contrast);
        this.uniformBuffer.updateFloat("saturation", this.uniforms.saturation);
        this.uniformBuffer.updateFloat("hueShift", this.uniforms.hueShift);
        this.uniformBuffer.updateFloat("gamma", this.uniforms.gamma);
        this.uniformBuffer.update();

        // 绑定输入纹理
        this.computeShader.setTexture("inputTexture", this.videoTexture, false);
        this.computeShader.setTextureSampler("inputTextureSampler", this.inputTextureSampler);
        
        // 绑定输出纹理
        this.computeShader.setStorageTexture("outputTexture", this.outputTexture);
        
        // 绑定 uniform buffer
        this.computeShader.setUniformBuffer("uniforms", this.uniformBuffer);
        
        // 执行 compute shader
        const workgroupCountX = Math.ceil(1920 / 8);
        const workgroupCountY = Math.ceil(1080 / 8);
        this.computeShader.dispatch(workgroupCountX, workgroupCountY, 1);
    }

    public getUniforms(): ShaderUniforms {
        return { ...this.uniforms };
    }

    public dispose(): void {
        if (this.material) {
            this.material.dispose();
        }
        // Compute shader 不需要手动 dispose
        if (this.outputTexture) {
            this.outputTexture.dispose();
        }
        if (this.uniformBuffer) {
            this.uniformBuffer.dispose();
        }
    }
}
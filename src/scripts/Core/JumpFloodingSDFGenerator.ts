import * as BABYLON from 'babylonjs';
import jfaComputeShader from '../../Shaders/JumpFlooding2D.compute.wgsl';
import { DoubleBufferedRawTexture2D } from '../GfxUtils/DoubleBufferUtils';
import { ComputeShaderSet } from '../GfxUtils/ComputeShaderSet';
import MathUtils from '../MathUtils/MathUtils';
import { UIBinding } from '../GUI/UIProperty';

enum JFAInputValueMode
{
    RChannel = 0,
    GChannel = 1,
    BChannel = 2,
    AChannel = 3,
    Luminance = 4,
}


export class JFAParamUniforms 
{
    public texelSize: BABYLON.Vector4 = new BABYLON.Vector4(0, 0, 0, 0);
    public jumpDistance: BABYLON.Vector2 = new BABYLON.Vector2(0, 0);
    @UIBinding({category: "SDF Generation", bindingParams: { label: "Input Value Mode", options: {
        "RChannel": JFAInputValueMode.RChannel,
        "GChannel": JFAInputValueMode.GChannel,
        "BChannel": JFAInputValueMode.BChannel,
        "AChannel": JFAInputValueMode.AChannel,
        "Luminance": JFAInputValueMode.Luminance,
    }}})
    public inputValueMode: JFAInputValueMode = JFAInputValueMode.RChannel;
    @UIBinding({category: "SDF Generation", bindingParams: { label: "Input Value Threshold", min: 0, max: 1, step:0.01 } })
    public inputValueThreshold: number = 0.5;
    @UIBinding({category: "SDF Generation", bindingParams: { label: "Input Invert", type: 'boolean' } })
    public inputInvert: boolean = true;
    public interactSphere: BABYLON.Vector4 = new BABYLON.Vector4(0, 0, 0, 0);
}


export default class JumpFloodingSDFGenerator 
{
    private _jfaInputTexture: BABYLON.Texture | null = null;
    private _jfaTempBuffer  : DoubleBufferedRawTexture2D | null = null;
    private _jfaUniforms: JFAParamUniforms = new JFAParamUniforms();
    public get params() : JFAParamUniforms
    {
        return this._jfaUniforms;
    }
    private _jfaUniformBuffer : BABYLON.UniformBuffer | null = null;

    public get resultTexture() : BABYLON.Texture | null
    {
        return this._jfaTempBuffer?.Current() ?? null;
    }

    public get tempBuffer() : DoubleBufferedRawTexture2D | null
    {
        return this._jfaTempBuffer;
    }
    
    private _jfaComputeShader: ComputeShaderSet | null = null;
    private _scene: BABYLON.Scene | null = null;
    private _engine: BABYLON.Engine | null = null;

    private _cachedTexSize: BABYLON.Size = new BABYLON.Size(-1, -1);

    public InitializeIfNeeded(scene: BABYLON.Scene, 
        engine: BABYLON.Engine, inputTexture: BABYLON.Texture) : boolean
    {
        this._scene = scene;
        this._engine = engine;
        this._jfaInputTexture = inputTexture;

        if (!this._jfaInputTexture)
        {
            return false;
        }

        const currentTexSize = this._jfaInputTexture.getSize();
        if (currentTexSize.width <= 0 || currentTexSize.height <= 0)
        {
            return false;
        }

        let inputTextureSizeChanged = false;
        if (currentTexSize.width != this._cachedTexSize.width 
            || currentTexSize.height != this._cachedTexSize.height)
        {
            inputTextureSizeChanged = true;
        }
        this._cachedTexSize = new BABYLON.Size(currentTexSize.width, currentTexSize.height);

        if (inputTextureSizeChanged)
        {
            if (this._jfaTempBuffer)
                this._jfaTempBuffer.Release();

            // Create temp buffer
            this._jfaTempBuffer = new DoubleBufferedRawTexture2D(this._scene, this._engine);
            this._jfaTempBuffer.width = currentTexSize.width;
            this._jfaTempBuffer.height = currentTexSize.height;
            this._jfaTempBuffer.format = BABYLON.Engine.TEXTUREFORMAT_RGBA;
            this._jfaTempBuffer.type = BABYLON.Engine.TEXTURETYPE_HALF_FLOAT;
            this._jfaTempBuffer.samplingMode = BABYLON.Texture.BILINEAR_SAMPLINGMODE;
            this._jfaTempBuffer.creationFlags = BABYLON.Constants.TEXTURE_CREATIONFLAG_STORAGE;
            this._jfaTempBuffer.useSRGBBuffer = false;
            this._jfaTempBuffer.waitDataToBeReady = false;
            this._jfaTempBuffer.Create();
            this._jfaTempBuffer.Current()!.name = "JFA_Buffer A";
            this._jfaTempBuffer.Prev()!.name = "JFA_Buffer B";
        }

        if (!this._jfaComputeShader)
        {
            this._jfaComputeShader = ComputeShaderSet.Create(jfaComputeShader, this._engine);
        }
    
        if (!this._jfaUniformBuffer)
        {
            this._jfaUniformBuffer = new BABYLON.UniformBuffer(this._engine);
            this._jfaComputeShader!.InitializeStructUBO(this._jfaUniformBuffer, 0);
        }

        if (!this._jfaComputeShader!.IsAllKernelsReady())
        {
            console.warn("JFA Compute Shaders are not ready, Update Loop will not be executed");
            return false;
        }

        return true;
    }

    private UpdateJFAUniforms() : void
    {
        if (!this._jfaUniformBuffer)
        {
            return;
        }

        this._jfaUniformBuffer.updateVector4("_JFA_TexelSize", this._jfaUniforms.texelSize);
        this._jfaUniformBuffer.updateInt2("_JFA_JumpDistance", this._jfaUniforms.jumpDistance.x, this._jfaUniforms.jumpDistance.y);
        this._jfaUniformBuffer.updateUInt("_JFA_InputValueMode", this._jfaUniforms.inputValueMode);
        this._jfaUniformBuffer.updateFloat("_JFA_InputValueThreshold", this._jfaUniforms.inputValueThreshold);
        this._jfaUniformBuffer.updateFloat("_JFA_InputInvert", this._jfaUniforms.inputInvert ? 1.0 : 0.0);
        this._jfaUniformBuffer.updateFloat4("_JFA_InteractSphere", this._jfaUniforms.interactSphere.x, this._jfaUniforms.interactSphere.y, this._jfaUniforms.interactSphere.z, this._jfaUniforms.interactSphere.w);
        this._jfaUniformBuffer.update();
    }


    private UpdateJFA() : void
    {
        if (!this._jfaComputeShader)
        {
            return;
        }

        const texSize = this._jfaInputTexture!.getSize();
        const texelSize = new BABYLON.Vector4(1.0 / texSize.width, 1.0 / texSize.height, texSize.width, texSize.height);
        this._jfaUniforms.texelSize = texelSize;
        this._jfaUniforms.jumpDistance = new BABYLON.Vector2(this._cachedTexSize.width, this._cachedTexSize.height);

        this.UpdateJFAUniforms();

        // Initialize Pass
        const kernel_Init = this._jfaComputeShader.GetKernel("JFA_Initialize");
        if (!kernel_Init)
        {
            return;
        }
        kernel_Init!.cs!.setUniformBuffer("_JFA_Uniforms", this._jfaUniformBuffer!);
        kernel_Init!.cs!.setTexture("_JFA_InputTexture", this._jfaInputTexture!, false);
        kernel_Init!.cs!.setStorageTexture("_JFA_TempBufferOut", this._jfaTempBuffer!.Current()!);
        kernel_Init!.cs!.dispatch(
            (texSize.width + kernel_Init!.workgroupSizeX - 1) / kernel_Init!.workgroupSizeX, 
            (texSize.height + kernel_Init!.workgroupSizeY - 1) / kernel_Init!.workgroupSizeY, 
            1);

        // Iteration Pass
        {
            const kernel_Iteration = this._jfaComputeShader.GetKernel("JFA_Iteration");
            if (!kernel_Iteration)
            {
                return;
            }
    
            let jumpDistanceX = MathUtils.NextPowerOfTwo(this._cachedTexSize.width);
            let jumpDistanceY = MathUtils.NextPowerOfTwo(this._cachedTexSize.height);
    
            const JFA_MAX_ITERATION_COUNT = 20;
            let iterationCount = 0;
    
            while (jumpDistanceX >= 1 || jumpDistanceY >= 1 && iterationCount < JFA_MAX_ITERATION_COUNT)
            {
                this._jfaTempBuffer!.Swap();
                this._jfaUniforms.jumpDistance = new BABYLON.Vector2(jumpDistanceX, jumpDistanceY);
                this._jfaUniformBuffer!.updateInt2("_JFA_JumpDistance", this._jfaUniforms.jumpDistance.x, this._jfaUniforms.jumpDistance.y);
                this._jfaUniformBuffer!.update();
                kernel_Iteration!.cs!.setUniformBuffer("_JFA_Uniforms", this._jfaUniformBuffer!);
                const bufferIn = this._jfaTempBuffer!.Prev()!;
                const bufferOut = this._jfaTempBuffer!.Current()!;
                kernel_Iteration!.cs!.setTexture("_JFA_TempBufferIn", bufferIn, false);
                kernel_Iteration!.cs!.setStorageTexture("_JFA_TempBufferOut", bufferOut);
                kernel_Iteration!.cs!.dispatch(
                    (texSize.width + kernel_Iteration!.workgroupSizeX - 1) / kernel_Iteration!.workgroupSizeX, 
                    (texSize.height + kernel_Iteration!.workgroupSizeY - 1) / kernel_Iteration!.workgroupSizeY, 
                    1);
                jumpDistanceX /= 2;
                jumpDistanceY /= 2;
                iterationCount++;
            }
        }


        // Generate Distance Field Pass
        {
            const kernel_SDFGen = this._jfaComputeShader.GetKernel("JFA_GenerateDistanceField");
            if (!kernel_SDFGen)
            {
                return;
            }
            this._jfaTempBuffer!.Swap();

            kernel_SDFGen!.cs!.setUniformBuffer("_JFA_Uniforms", this._jfaUniformBuffer!);
            kernel_SDFGen!.cs!.setTexture("_JFA_TempBufferIn", this._jfaTempBuffer!.Prev()!, false);
            kernel_SDFGen!.cs!.setStorageTexture("_JFA_TempBufferOut", this._jfaTempBuffer!.Current()!);
            kernel_SDFGen!.cs!.dispatch(
                (texSize.width + kernel_SDFGen!.workgroupSizeX - 1) / kernel_SDFGen!.workgroupSizeX, 
                (texSize.height + kernel_SDFGen!.workgroupSizeY - 1) / kernel_SDFGen!.workgroupSizeY, 
                1);
        }

    }


    public Tick(scene: BABYLON.Scene, engine: BABYLON.Engine, inputTexture: BABYLON.Texture) : void
    {
        if(!this.InitializeIfNeeded(scene, engine, inputTexture))
        {
            console.warn("Failed to initialize JFA, Update Loop will not be executed");
            return;
        }

        this.UpdateJFA();
    }

    public Release() : void
    {
        if (this._jfaTempBuffer)
            this._jfaTempBuffer.Release();
        if (this._jfaUniformBuffer)
            this._jfaUniformBuffer.dispose();

        this._jfaTempBuffer = null;
        this._jfaUniformBuffer = null;
        this._jfaComputeShader = null;
        this._scene = null;
        this._engine = null;
        this._cachedTexSize = new BABYLON.Size(-1, -1);
    }
}
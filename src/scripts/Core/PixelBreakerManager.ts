

import * as BABYLON from 'babylonjs';
import { StorageBuffer, UniformBuffer } from "babylonjs";
import { DoubleBufferedStorageBuffer } from "../GfxUtils/DoubleBufferUtils";
import { IndirectArgsBuffer } from "../GfxUtils/IndirectArgsBuffer";
import { ComputeShaderSet } from "../GfxUtils/ComputeShaderSet";
import pixelBreakerComputeShader from "../../Shaders/PixelBreaker.compute.wgsl";
import { SharedTextureSamplerCollection } from "../GfxUtils/SharedTextureSampler";
import { NumberInput, UIProperty } from '../GUI/UIProperty';


class RenderTargetSizeInfo
{
    public width: number = -1;
    public height: number = -1;
    public totalTexelCount: number = -1;
    public texelSize: BABYLON.Vector4 = new BABYLON.Vector4(0, 0, 0, 0);

    public Update(newSize: BABYLON.ISize)
    {
        this.width = newSize.width;
        this.height = newSize.height;
        this.totalTexelCount = this.width * this.height;
        this.texelSize = new BABYLON.Vector4(1.0 / this.width, 1.0 / this.height, this.width, this.height);
    }

    public IsDifferent(other: BABYLON.ISize) : boolean
    {
        return this.width != other.width || this.height != other.height;
    }

    public IsValid() : boolean
    {
        return this.width > 0 && this.height > 0;
    }
}

export class ParticleCountReadbackBuffer
{
    public buffer = new Uint32Array(3);
    
    @NumberInput({category: "Particle Count", label: "Dynamic", readonly: true, format: (value: number) => { return value.toFixed(); } })
    public dynamicParticleCount: number = 0;
    @NumberInput({category: "Particle Count", label: "Static", readonly: true, format: (value: number) => { return value.toFixed(); } })
    public staticParticleCount: number = 0;
    @NumberInput({category: "Particle Count", label: "Convert Candidate", readonly: true, format: (value: number) => { return value.toFixed(); } })
    public convertCandidateParticleCount: number = 0;

    public Update()
    {
        this.dynamicParticleCount = this.buffer[0];
        this.staticParticleCount = this.buffer[1];
        this.convertCandidateParticleCount = this.buffer[2];
    }
}

export class PixelBreakerManager
{
    // Params
    public dynamicParticleInitialCount: number = 10000;

    public staticParticleSpawnRectMin01: BABYLON.Vector2 = new BABYLON.Vector2(0, 0.5);
    public staticParticleSpawnRectMax01: BABYLON.Vector2 = new BABYLON.Vector2(1, 0.75);
    
    public reflectionBoardRectMin01: BABYLON.Vector2 = new BABYLON.Vector2(0.4, 0.5);
    public reflectionBoardRectMax01: BABYLON.Vector2 = new BABYLON.Vector2(0.6, 0.55);

    public reflectionBoardColor: BABYLON.Color4 = new BABYLON.Color4(0.8, 0.8, 0.8, 1.0);

    public dynamicParticleMaxSpeed: number = 10.0;
    public dynamicParticleSize: number = 2.0;

    public particleCountReadback: ParticleCountReadbackBuffer = new ParticleCountReadbackBuffer();
    
    // Private States
    private _renderTargetSizeInfo: RenderTargetSizeInfo = new RenderTargetSizeInfo();
    private _staticParticleSpawnRectMin: BABYLON.Vector2 = new BABYLON.Vector2(-1, -1);
    private _staticParticleSpawnRectMax: BABYLON.Vector2 = new BABYLON.Vector2(-1, -1);
    private _reflectionBoardRectMin: BABYLON.Vector2 = new BABYLON.Vector2(-1, -1);
    private _reflectionBoardRectMax: BABYLON.Vector2 = new BABYLON.Vector2(-1, -1);

    private _isInitialiSpawnDone: boolean = false;

    // Resources
    private _scene: BABYLON.Scene | null = null;
    private _engine: BABYLON.AbstractEngine | null = null;

    private _uniformBuffer: UniformBuffer | null = null;
    
    private _particleMemoryBuffer: DoubleBufferedStorageBuffer | null = null;
    private _particleActivateStateBuffer: DoubleBufferedStorageBuffer | null = null;
    private _particleCountBuffer: DoubleBufferedStorageBuffer | null = null;
    private _particleConvertCandidateBuffer: StorageBuffer | null = null;

    private _softwareRasterTargetBuffer: DoubleBufferedStorageBuffer | null = null;

    private _computeShaderSet: ComputeShaderSet | null = null;
    private _sharedTextureSamplerCollection: SharedTextureSamplerCollection | null = null;

    private _indirectArgs_UpdateDynamicParticles: IndirectArgsBuffer | null = null;
    private _indirectArgs_ConvertStaticParticles: IndirectArgsBuffer | null = null;
    private _indirectArgs_RasterizeParticles: IndirectArgsBuffer | null = null;

    public InitializeIfNeeded(scene: BABYLON.Scene, 
        engine: BABYLON.AbstractEngine,
        renderTargetSize: BABYLON.ISize) : boolean
    {
        this._scene = scene;
        this._engine = engine;

        const renderTargetSizeChanged = this._renderTargetSizeInfo.IsDifferent(renderTargetSize);
        this._renderTargetSizeInfo.Update(renderTargetSize);

        if (!this._renderTargetSizeInfo.IsValid())
        {
            console.error("Render target size is not set for PixelBreakerManager");
            return false;
        }

        if (!this._uniformBuffer)
        {
            this._uniformBuffer = new UniformBuffer(this._engine);
            this._uniformBuffer.name = "PixelBreaker UniformBuffer";
            this._uniformBuffer.addUniform("_RenderTargetTexelSize", 4);
            this._uniformBuffer.addUniform("_TotalParticleCapacity", 1);
            this._uniformBuffer.addUniform("_DynamicParticleInitialCount", 1);
            this._uniformBuffer.addUniform("_DynamicParticleMaxSpeed", 1);
            this._uniformBuffer.addUniform("_DynamicParticleSize", 1);
            this._uniformBuffer.addUniform("_StaticParticleSpawnRectMinMax", 4);
            this._uniformBuffer.addUniform("_ReflectionBoardRectMinMax", 4);
            this._uniformBuffer.addUniform("_ReflectionBoardColor", 4);
            this._uniformBuffer.create();
        }
        
        if(!this._computeShaderSet)
        {
            this._computeShaderSet = ComputeShaderSet.Create(pixelBreakerComputeShader, this._engine!);
        }

        // Rebuild Size Related Resources
        if (renderTargetSizeChanged)
        {
            this._isInitialiSpawnDone = false;
            const TOTAL_PARTICLE_CAPACITY = this.dynamicParticleInitialCount + this._renderTargetSizeInfo.totalTexelCount;

            if (this._particleMemoryBuffer)
                this._particleMemoryBuffer.Release();
            // Float2 Position, Float2 Velocity, UInt Color
            const PARTICLE_STATE_SIZE = 5;
            this._particleMemoryBuffer = new DoubleBufferedStorageBuffer(
                this._engine as BABYLON.WebGPUEngine,
                TOTAL_PARTICLE_CAPACITY * PARTICLE_STATE_SIZE,
                BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE | BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE,
                "ParticleMemoryBuffer"
            );
            this._particleMemoryBuffer.Create();


            if (this._particleActivateStateBuffer)
                this._particleActivateStateBuffer.Release();
            // UInt Activate State
            this._particleActivateStateBuffer = new DoubleBufferedStorageBuffer(
                this._engine as BABYLON.WebGPUEngine,
                TOTAL_PARTICLE_CAPACITY * 1,
                BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE | BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE,
                "ParticleActivateStateBuffer"
            );
            this._particleActivateStateBuffer.Create();


            if (this._particleCountBuffer)
                this._particleCountBuffer.Release();
            // [0] = Dynamic Particle Count, [1] = Static Particle Count, [2] = Convert Candidate Particle Count
            this._particleCountBuffer = new DoubleBufferedStorageBuffer(
                this._engine as BABYLON.WebGPUEngine,
                3, 
                BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE | BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE,
                "ParticleCountBuffer"
            );
            this._particleCountBuffer.Create();


            if (this._particleConvertCandidateBuffer)
                this._particleConvertCandidateBuffer.dispose();
            this._particleConvertCandidateBuffer = new StorageBuffer(
                this._engine as BABYLON.WebGPUEngine,
                TOTAL_PARTICLE_CAPACITY * 1, 
                BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE | BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE,
                "ParticleConvertCandidateBuffer"
            );

            if (this._softwareRasterTargetBuffer)
                this._softwareRasterTargetBuffer.Release();
            // UInt Color
            this._softwareRasterTargetBuffer = new DoubleBufferedStorageBuffer(
                this._engine as BABYLON.WebGPUEngine,
                this._renderTargetSizeInfo.totalTexelCount * 1,
                BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE | BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE,
                "SoftwareRasterTargetBuffer"
            );
            this._softwareRasterTargetBuffer.Create(); 
        }


        // Indirect Args Buffers
        if (!this._indirectArgs_UpdateDynamicParticles)
        {
            this._indirectArgs_UpdateDynamicParticles = new IndirectArgsBuffer(
                this._engine as BABYLON.WebGPUEngine, 
                3, BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE, 
                "IndirectArgs_UpdateDynamicParticles"
            );
        }
        if (!this._indirectArgs_ConvertStaticParticles)
        {
            this._indirectArgs_ConvertStaticParticles = new IndirectArgsBuffer(
                this._engine as BABYLON.WebGPUEngine, 
                3, BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE, 
                "IndirectArgs_ConvertStaticParticles"
            );
        }
        if (!this._indirectArgs_RasterizeParticles)
        {
            this._indirectArgs_RasterizeParticles = new IndirectArgsBuffer(
                this._engine as BABYLON.WebGPUEngine, 
                3, BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE, 
                "IndirectArgs_RasterizeParticles"
            );
        }

        if (!this._computeShaderSet!.IsAllKernelsReady())
        {
            console.warn("PixelBreakerManager Compute Shaders are not ready, Update Loop will not be executed");
            return false;
        }

        return true;
    }

    public Release()
    {
        if (this._uniformBuffer)
            this._uniformBuffer.dispose();

        if (this._particleMemoryBuffer)
            this._particleMemoryBuffer.Release();

        if (this._particleActivateStateBuffer)
            this._particleActivateStateBuffer.Release();
        
        if (this._particleCountBuffer)
            this._particleCountBuffer.Release();

        if (this._particleConvertCandidateBuffer)
            this._particleConvertCandidateBuffer.dispose();

        if (this._softwareRasterTargetBuffer)
            this._softwareRasterTargetBuffer.Release();

        if (this._indirectArgs_UpdateDynamicParticles)
            this._indirectArgs_UpdateDynamicParticles.Release();

        if (this._indirectArgs_ConvertStaticParticles)
            this._indirectArgs_ConvertStaticParticles.Release();

        if (this._indirectArgs_RasterizeParticles)
            this._indirectArgs_RasterizeParticles.Release();

        this._uniformBuffer = null;
        this._particleMemoryBuffer = null;
        this._particleActivateStateBuffer = null;
        this._particleCountBuffer = null;
        this._particleConvertCandidateBuffer = null;
        this._softwareRasterTargetBuffer = null;
        this._computeShaderSet = null;
        this._indirectArgs_UpdateDynamicParticles = null;
        this._indirectArgs_ConvertStaticParticles = null;
        this._indirectArgs_RasterizeParticles = null;
        this._scene = null;
        this._engine = null;
        this._sharedTextureSamplerCollection = null;
        this._renderTargetSizeInfo = new RenderTargetSizeInfo();
    }


    private UpdateUniformBuffer_Params()
    {
        if (!this._uniformBuffer)
            return;
        this._uniformBuffer.updateVector4("_RenderTargetTexelSize", this._renderTargetSizeInfo.texelSize);
        this._uniformBuffer.updateUInt("_TotalParticleCapacity", this.dynamicParticleInitialCount + this._renderTargetSizeInfo.totalTexelCount);
        this._uniformBuffer.updateUInt("_DynamicParticleInitialCount", this.dynamicParticleInitialCount);
        this._uniformBuffer.updateFloat("_DynamicParticleMaxSpeed", this.dynamicParticleMaxSpeed);
        this._uniformBuffer.updateFloat("_DynamicParticleSize", this.dynamicParticleSize);
        
        this._staticParticleSpawnRectMin = new BABYLON.Vector2(
            this.staticParticleSpawnRectMin01.x * this._renderTargetSizeInfo.width, 
            this.staticParticleSpawnRectMin01.y * this._renderTargetSizeInfo.height
        );
        this._staticParticleSpawnRectMax = new BABYLON.Vector2(
            this.staticParticleSpawnRectMax01.x * this._renderTargetSizeInfo.width, 
            this.staticParticleSpawnRectMax01.y * this._renderTargetSizeInfo.height
        );
        this._reflectionBoardRectMin = new BABYLON.Vector2(
            this.reflectionBoardRectMin01.x * this._renderTargetSizeInfo.width, 
            this.reflectionBoardRectMin01.y * this._renderTargetSizeInfo.height
        );
        this._reflectionBoardRectMax = new BABYLON.Vector2(
            this.reflectionBoardRectMax01.x * this._renderTargetSizeInfo.width, 
            this.reflectionBoardRectMax01.y * this._renderTargetSizeInfo.height
        );
        
        const staticParticleSpawnRectMinMax = new BABYLON.Vector4(
            this._staticParticleSpawnRectMin.x, 
            this._staticParticleSpawnRectMin.y, 
            this._staticParticleSpawnRectMax.x, 
            this._staticParticleSpawnRectMax.y,
        );

        const reflectionBoardRectMinMax = new BABYLON.Vector4(
            this._reflectionBoardRectMin.x, 
            this._reflectionBoardRectMin.y, 
            this._reflectionBoardRectMax.x, 
            this._reflectionBoardRectMax.y
        );
        const reflectionBoardColor = new BABYLON.Vector4(this.reflectionBoardColor.r, this.reflectionBoardColor.g, this.reflectionBoardColor.b, this.reflectionBoardColor.a);
        this._uniformBuffer.updateVector4("_StaticParticleSpawnRectMinMax", staticParticleSpawnRectMinMax);
        this._uniformBuffer.updateVector4("_ReflectionBoardRectMinMax", reflectionBoardRectMinMax);
        this._uniformBuffer.updateVector4("_ReflectionBoardColor", reflectionBoardColor);
        this._uniformBuffer.update();
    }




    public Tick(scene: BABYLON.Scene, 
                engine: BABYLON.AbstractEngine,
                renderTargetSize: BABYLON.ISize,
                sdfTexture: BABYLON.Texture | null) : void
    {
        if (!this.InitializeIfNeeded(scene, engine, renderTargetSize))
        {
            console.warn("Failed to initialize PixelBreakerManager, Update Loop will not be executed");
            return;
        }

        this.UpdateUniformBuffer_Params();

        if (!this._isInitialiSpawnDone)
        {
            this._isInitialiSpawnDone = this.DispatchParticleInitSpawn();
            console.log("Initial Spawn: ", this._isInitialiSpawnDone);
            if (this._isInitialiSpawnDone)
                this.DispatchParticleSoftwareRasterize();
            return;
        }

        this._particleMemoryBuffer!.Swap();
        this._particleActivateStateBuffer!.Swap();
        // this._particleCountBuffer!.Swap();
        this._softwareRasterTargetBuffer!.Swap();

        this.DispatchClearParticleCounter();
        this.DispatchConvertStaticParticles();
        this.DispatchUpdateDynamicParticles();
        this.DispatchParticleSoftwareRasterize();

        this._particleCountBuffer?.Current()?.read(0,3 * 4, this.particleCountReadback.buffer).then(() => {
            this.particleCountReadback.Update();
        });
    }



    private DispatchParticleInitSpawn() : boolean
    {
        if (!this._computeShaderSet)
            return false;
        const kInitialFillParticleCountBuffer = this._computeShaderSet.GetKernel("InitialFillParticleCountBuffer");
        if (!kInitialFillParticleCountBuffer)
            return false;
        const kInitialSpawnParticles = this._computeShaderSet.GetKernel("InitialSpawnParticles");
        if (!kInitialSpawnParticles)
            return false;        
        

        const staticParticleSpawnCount = 
                    (this._staticParticleSpawnRectMax.x - this._staticParticleSpawnRectMin.x) 
                    * (this._staticParticleSpawnRectMax.y - this._staticParticleSpawnRectMin.y);
        const totalSpawnCount = this.dynamicParticleInitialCount + staticParticleSpawnCount;
        console.log("Initial Spawn Count Dynamic: ", this.dynamicParticleInitialCount);
        console.log("Initial Spawn Count Static: ", staticParticleSpawnCount);

        kInitialFillParticleCountBuffer!.cs!.setUniformBuffer("_Uniforms", this._uniformBuffer!);
        kInitialFillParticleCountBuffer!.cs!.setStorageBuffer("_ParticleCountBuffer_RW", this._particleCountBuffer!.Current()!);
        kInitialFillParticleCountBuffer!.cs!.dispatch(1, 1, 1);

        kInitialSpawnParticles!.cs!.setUniformBuffer("_Uniforms", this._uniformBuffer!);
        kInitialSpawnParticles!.cs!.setStorageBuffer("_ParticleMemoryBuffer_RW", this._particleMemoryBuffer!.Current()!);
        kInitialSpawnParticles!.cs!.setStorageBuffer("_ParticleActivateStateBuffer_RW", this._particleActivateStateBuffer!.Current()!);
        
        const workGroupSizeX = kInitialSpawnParticles!.workgroupSizeX;
        const canSpawn = kInitialSpawnParticles!.cs!.dispatch((totalSpawnCount + workGroupSizeX - 1) / workGroupSizeX, 1, 1);
        return canSpawn;
    }

    private DispatchClearParticleCounter() : void
    {
        if (!this._computeShaderSet)
            return;
        const kClearParticleCounter = this._computeShaderSet.GetKernel("ClearParticleCounter");
        if (!kClearParticleCounter)
            return;

        kClearParticleCounter!.cs!.setStorageBuffer("_ParticleCountBuffer_RW", this._particleCountBuffer!.Current()!);
        kClearParticleCounter!.cs!.dispatch(1, 1, 1);
    }

    private DispatchFillIndirectArgs()
    {
        if (!this._computeShaderSet)
            return;
        const kFillIndirectArgs = this._computeShaderSet.GetKernel("FillIndirectArgs");
        if (!kFillIndirectArgs)
            return;

        kFillIndirectArgs!.cs!.setUniformBuffer("_Uniforms", this._uniformBuffer!);
        kFillIndirectArgs!.cs!.setStorageBuffer("_ParticleCountBuffer_RW", this._particleCountBuffer!.Current()!);
        kFillIndirectArgs!.cs!.setStorageBuffer("_IndirectDispatchArgsBuffer_UpdateDynamicParticles_RW", this._indirectArgs_UpdateDynamicParticles!.storageBuffer);
        kFillIndirectArgs!.cs!.setStorageBuffer("_IndirectDispatchArgsBuffer_ConvertStaticParticles_RW", this._indirectArgs_ConvertStaticParticles!.storageBuffer);
        kFillIndirectArgs!.cs!.setStorageBuffer("_IndirectDispatchArgsBuffer_RasterizeParticles_RW", this._indirectArgs_RasterizeParticles!.storageBuffer);
        kFillIndirectArgs!.cs!.dispatch(1, 1, 1);
    }

    private DispatchParticleSoftwareRasterize()
    {
        if (!this._computeShaderSet)
            return;

        const kSoftwareRasterizeParticles = this._computeShaderSet.GetKernel("SoftwareRasterizeParticles");
        if (!kSoftwareRasterizeParticles)
            return;


    }


    private DispatchConvertStaticParticles()
    {
        if (!this._computeShaderSet)
            return;
        const kConvertStaticParticles = this._computeShaderSet.GetKernel("ConvertStaticParticles");
        if (!kConvertStaticParticles)
            return;
    }


    private DispatchUpdateDynamicParticles()
    {
        if (!this._computeShaderSet)
            return;
        const kUpdateDynamicParticles = this._computeShaderSet.GetKernel("UpdateDynamicParticles");
        if (!kUpdateDynamicParticles)
            return;
    }



}
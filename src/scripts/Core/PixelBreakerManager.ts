

import * as BABYLON from 'babylonjs';
import { StorageBuffer, UniformBuffer } from "babylonjs";
import { DoubleBufferedStorageBuffer } from "../GfxUtils/DoubleBufferUtils";
import { IndirectArgsBuffer } from "../GfxUtils/IndirectArgsBuffer";
import { ComputeShaderSet } from "../GfxUtils/ComputeShaderSet";
import pixelBreakerComputeShader from "../../Shaders/PixelBreaker.compute.wgsl";
import { SharedTextureSamplerCollection } from "../GfxUtils/SharedTextureSampler";


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

export class PixelBreakerManager
{
    // Params
    public dynamicParticleInitialCount: number = 10000;
    public staticParticleSpawnRectMinMax01: BABYLON.Vector4 = new BABYLON.Vector4(0, 0.5, 1, 0.75);
    
    public reflectionBoardRectMinMax01: BABYLON.Vector4 = new BABYLON.Vector4(0.4, 0.5, 0.6, 0.55);
    public reflectionBoardColor: BABYLON.Color4 = new BABYLON.Color4(0.8, 0.8, 0.8, 1.0);

    public dynamicParticleMaxSpeed: number = 10.0;
    public dynamicParticleSize: number = 2.0;

    
    // Private States
    private _renderTargetSizeInfo: RenderTargetSizeInfo = new RenderTargetSizeInfo();
    private _isFirstTick: boolean = true;

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
            this._uniformBuffer.addUniform("_DispatchedThreadCount", 1);
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
            this._isFirstTick = true;
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
            // [0] = Dynamic Particle Count, [1] = Convert Candidate Particle Count
            this._particleCountBuffer = new DoubleBufferedStorageBuffer(
                this._engine as BABYLON.WebGPUEngine,
                2, 
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
        this._uniformBuffer.updateFloat("_DynamicParticleMaxSpeed", this.dynamicParticleMaxSpeed);
        this._uniformBuffer.updateFloat("_DynamicParticleSize", this.dynamicParticleSize);
        const staticParticleSpawnRectMinMax = new BABYLON.Vector4(
            this.staticParticleSpawnRectMinMax01.x * this._renderTargetSizeInfo.width, 
            this.staticParticleSpawnRectMinMax01.y * this._renderTargetSizeInfo.height, 
            this.staticParticleSpawnRectMinMax01.z * this._renderTargetSizeInfo.width, 
            this.staticParticleSpawnRectMinMax01.w * this._renderTargetSizeInfo.height
        );
        const reflectionBoardRectMinMax = new BABYLON.Vector4(
            this.reflectionBoardRectMinMax01.x * this._renderTargetSizeInfo.width, 
            this.reflectionBoardRectMinMax01.y * this._renderTargetSizeInfo.height, 
            this.reflectionBoardRectMinMax01.z * this._renderTargetSizeInfo.width, 
            this.reflectionBoardRectMinMax01.w * this._renderTargetSizeInfo.height
        );
        const reflectionBoardColor = new BABYLON.Vector4(this.reflectionBoardColor.r, this.reflectionBoardColor.g, this.reflectionBoardColor.b, this.reflectionBoardColor.a);
        this._uniformBuffer.updateVector4("_StaticParticleSpawnRectMinMax", staticParticleSpawnRectMinMax);
        this._uniformBuffer.updateVector4("_ReflectionBoardRectMinMax", reflectionBoardRectMinMax);
        this._uniformBuffer.updateVector4("_ReflectionBoardColor", reflectionBoardColor);
        this._uniformBuffer.update();
    }

    private UpdateUniformBuffer_DispatchedThreadCount()
    {
        if (!this._uniformBuffer)
            return;
        this._uniformBuffer.updateUInt("_DispatchedThreadCount", this._renderTargetSizeInfo.totalTexelCount);
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

        if (this._isFirstTick)
        {
            this._isFirstTick = false;
            return;
        }

    }










}
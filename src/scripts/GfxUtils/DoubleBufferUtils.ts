import * as BABYLON from 'babylonjs';

abstract class DoubleBuffered<T> 
{
    protected _buffer1: T | null = null;
    protected _buffer2: T | null = null;

    public Swap()
    {
        const temp = this._buffer1;
        this._buffer1 = this._buffer2;
        this._buffer2 = temp;
    }

    public Current()
    {
        return this._buffer2;
    }

    public Prev()
    {
        return this._buffer1;
    }

    protected abstract Create(): void;
    protected abstract Release(): void;
}


export class DoubleBufferedRawTexture2D extends DoubleBuffered<BABYLON.RawTexture>
{
    private _scene: BABYLON.Scene;
    private _engine: BABYLON.Engine;

    public width : number = 1;
    public height : number = 1;
    public generateMipMaps : boolean = false;
    public invertY : boolean = false;
    public format : number = BABYLON.Engine.TEXTUREFORMAT_RGBA;
    public type : number = BABYLON.Engine.TEXTURETYPE_FLOAT;
    public samplingMode : number = BABYLON.Texture.BILINEAR_SAMPLINGMODE;
    public creationFlags : number = 0;
    public useSRGBBuffer : boolean = false;
    public waitDataToBeReady : boolean = false;


    public constructor(scene: BABYLON.Scene, engine: BABYLON.Engine)
    {
        super();
        this._scene = scene;
        this._engine = engine;
    }
    
    public override Create(): void
    {
        this._buffer1 = new BABYLON.RawTexture(
            null,
            this.width,
            this.height,
            this.format,
            this._scene,
            this.generateMipMaps,
            this.invertY,
            this.samplingMode,
            this.type,
            this.creationFlags,
            this.useSRGBBuffer
        );
        
        this._buffer2 = new BABYLON.RawTexture(
            null,
            this.width,
            this.height,
            this.format,
            this._scene,
            this.generateMipMaps,
            this.invertY,
            this.samplingMode,
            this.type,
            this.creationFlags,
            this.useSRGBBuffer
        );
    }

    public override Release(): void
    {
        if (this._buffer1)
        {
            this._buffer1.dispose();
        }
        if (this._buffer2)
        {
            this._buffer2.dispose();
        }
        this._buffer1 = null;
        this._buffer2 = null;
    }
}


export class DoubleBufferedStorageBuffer extends DoubleBuffered<BABYLON.StorageBuffer>
{
    private _engine: BABYLON.WebGPUEngine;

    public constructor(engine: BABYLON.WebGPUEngine, num32Size: number, creationFlags: number, label: string = "")
    {
        super();
        this._engine = engine;
        this.num32Size = num32Size;
        this.creationFlags = creationFlags;
        this.label = label;
    }

    public creationFlags : number = BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE;
    public num32Size : number = 0;
    public label : string = "";

    public override Create(): void
    {
        if (this.num32Size <= 0)
        {
            console.error("Byte size is not set for DoubleBufferedStorageBuffer");
            return;
        }

        this._buffer1 = new BABYLON.StorageBuffer(
            this._engine,
            this.num32Size * 4,
            this.creationFlags,
            this.label + " A"
        );
        this._buffer2 = new BABYLON.StorageBuffer(
            this._engine,
            this.num32Size * 4,
            this.creationFlags,
            this.label + " B"
        );
    }

    public override Release(): void
    {
        if (this._buffer1)
        {
            this._buffer1.dispose();
        }
        if (this._buffer2)
        {
            this._buffer2.dispose();
        }
        this._buffer1 = null;
        this._buffer2 = null;
    }
}
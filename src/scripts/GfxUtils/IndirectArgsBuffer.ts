
import * as BABYLON from 'babylonjs';


export class IndirectArgsBuffer
{
    private _storageBuffer: BABYLON.StorageBuffer | null = null;
    public constructor(engine: BABYLON.WebGPUEngine, 
        uintSize: number, 
        readWriteFlags: number,
        label: string = "IndirectArgsBuffer")
    {
        this._storageBuffer = new BABYLON.StorageBuffer(engine, uintSize * 4, 
            BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE | 
            BABYLON.Constants.BUFFER_CREATIONFLAG_INDIRECT |
            readWriteFlags,
            label);
    }

    public get storageBuffer() : BABYLON.StorageBuffer
    {
        return this._storageBuffer!;
    }

    public Release()
    {
        if (this._storageBuffer)
            this._storageBuffer.dispose();
        this._storageBuffer = null;
    }
}

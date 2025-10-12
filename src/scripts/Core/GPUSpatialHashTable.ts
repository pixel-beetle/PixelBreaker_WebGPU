import { StorageBuffer, WebGPUEngine, Engine, AbstractEngine, UniformBuffer } from "babylonjs";
import { ComputeShaderSet } from "../GfxUtils/ComputeShaderSet";
import { UIBinding } from "../GUI/UIProperty";


export class GPUSpatialHashTable 
{
    // stores the linked list head for each hash bucket
    private _tableEntryBuffer: StorageBuffer | null = null;
    public get tableEntryBuffer(): StorageBuffer | null
    {
        return this._tableEntryBuffer;
    }
    // stores the next index for each linked list node
    private _tableLinkedListNodesBuffer: StorageBuffer | null = null;
    public get tableLinkedListNodesBuffer(): StorageBuffer | null
    {
        return this._tableLinkedListNodesBuffer;
    }
    private _tableLinkedListNodesCountBuffer: StorageBuffer | null = null;

    private _totalParticleCapacity: number = 0;
    private _engine: AbstractEngine;

    private _tableEntryCount: number = 32768;
    public get tableEntryCount(): number
    {
        return this._tableEntryCount;
    }
    private _computeShaderSet: ComputeShaderSet | null = null;

    public constructor(engine: AbstractEngine)
    {
        this._engine = engine;
    }

    public InitializeIfNeeded(totalParticleCapacity: number, computeShaderSet: ComputeShaderSet)
    {
        const linkedListBufferNeedRealloc = this._totalParticleCapacity < totalParticleCapacity;
        this._totalParticleCapacity = totalParticleCapacity;

        const sizeOfUInt = 4;
        const STORAGE_BUFFER_CREATION_FLAGS = BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE | BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE;
        this._computeShaderSet = computeShaderSet;

        if (!this._tableEntryBuffer || linkedListBufferNeedRealloc)
        {
            this._tableEntryCount = totalParticleCapacity + 1;
            if (this._tableEntryBuffer)
                this._tableEntryBuffer.dispose();
            this._tableEntryBuffer = new StorageBuffer(
                (this._engine as WebGPUEngine)!,
                this._tableEntryCount * sizeOfUInt,
                STORAGE_BUFFER_CREATION_FLAGS,
                "TableEntryBuffer"
            );
        }

        if (!this._tableLinkedListNodesBuffer || linkedListBufferNeedRealloc)
        {
            if (this._tableLinkedListNodesBuffer)
                this._tableLinkedListNodesBuffer.dispose();
            // each node:
            // particle index in particle memory buffer
            // next slot index in linked list buffer
            const linkedListNodesBufferSize = 
                Math.max(totalParticleCapacity, Math.max(256,this._tableEntryCount)) 
                * sizeOfUInt * 2;

            this._tableLinkedListNodesBuffer = new StorageBuffer(
                (this._engine as WebGPUEngine)!, 
                linkedListNodesBufferSize, 
                STORAGE_BUFFER_CREATION_FLAGS, 
                "TableLinkedListNodesBuffer"
            );
        }
        if (!this._tableLinkedListNodesCountBuffer)
        {
            // accumulated count of linked list nodes
            this._tableLinkedListNodesCountBuffer = new StorageBuffer(
                (this._engine as WebGPUEngine)!, 
                sizeOfUInt, 
                STORAGE_BUFFER_CREATION_FLAGS, 
                "TableLinkedListNodesCountBuffer"
            );
        }
    }

    public Release()
    {
        if (this._tableEntryBuffer)
            this._tableEntryBuffer.dispose();
        if (this._tableLinkedListNodesBuffer)
            this._tableLinkedListNodesBuffer.dispose();
        if (this._tableLinkedListNodesCountBuffer)
            this._tableLinkedListNodesCountBuffer.dispose();

        this._tableEntryBuffer = null;
        this._tableLinkedListNodesBuffer = null;
        this._tableLinkedListNodesCountBuffer = null;
        this._computeShaderSet = null;
    }

    public DispatchClearTable(computeUBO: UniformBuffer)
    {
        if (!this._tableEntryBuffer 
            || !this._tableLinkedListNodesCountBuffer 
            || !this._tableLinkedListNodesBuffer
            || !this._computeShaderSet)
        {
            console.warn("Failed to dispatch clear table, buffer arguments are not set");
            return;
        }
        const kClearTable = this._computeShaderSet!.GetKernel("SHT_ClearTable");
        if (!kClearTable)
        {
            console.warn("Failed to dispatch clear table, kernel is not found");
            return;
        }
        kClearTable.cs!.setUniformBuffer("_Uniforms", computeUBO!);
        // clear this to be all UINT_MAX as INVALID
        kClearTable.cs!.setStorageBuffer("_SHT_TableEntryBuffer_RW", this._tableEntryBuffer!);
        // clear this to be 0
        kClearTable.cs!.setStorageBuffer("_SHT_TableLinkedListNodesCountBuffer_RW", this._tableLinkedListNodesCountBuffer!);
        const workGroupSizeX = kClearTable.workgroupSizeX;
        const workGroupCountX = (this._tableEntryCount + workGroupSizeX - 1) / workGroupSizeX;
        kClearTable.cs!.dispatch(workGroupCountX, 1, 1);
    }

    public DispatchFillTable(computeUBO: UniformBuffer,
                            particleMemoryBuffer: StorageBuffer, 
                            particleCountBuffer: StorageBuffer,
                            activeDynamicParticleSlotIndexBuffer: StorageBuffer,
                            indirectDispatchArgsBuffer: StorageBuffer,
                        indirectDispatchArgsOffsetByUInts: number = 0)
    {
        if (!this._tableEntryBuffer 
            || !this._tableLinkedListNodesCountBuffer 
            || !this._tableLinkedListNodesBuffer
            || !this._computeShaderSet
            || !particleMemoryBuffer
            || !particleCountBuffer
            || !activeDynamicParticleSlotIndexBuffer
            || !indirectDispatchArgsBuffer)
        {
            console.warn("Failed to dispatch fill table, buffer arguments are not set");
            return;
        }
        
        const kFillTable = this._computeShaderSet!.GetKernel("SHT_FillTable");
        if (!kFillTable)
        {
            console.warn("Failed to dispatch fill table, kernel is not found");
            return;
        }

        kFillTable.cs!.setUniformBuffer("_Uniforms", computeUBO!);
        kFillTable.cs!.setStorageBuffer("_SHT_TableEntryBuffer_RW", this._tableEntryBuffer!);
        kFillTable.cs!.setStorageBuffer("_SHT_TableLinkedListNodesBuffer_RW", this._tableLinkedListNodesBuffer!);
        kFillTable.cs!.setStorageBuffer("_SHT_TableLinkedListNodesCountBuffer_RW", this._tableLinkedListNodesCountBuffer!);
        kFillTable.cs!.setStorageBuffer("_ParticleMemoryBuffer_R", particleMemoryBuffer!);
        kFillTable.cs!.setStorageBuffer("_ActiveDynamicParticleSlotIndexBuffer_R", activeDynamicParticleSlotIndexBuffer!);
        kFillTable.cs!.setStorageBuffer("_ParticleCountBuffer_R", particleCountBuffer!);
        kFillTable.cs!.dispatchIndirect(indirectDispatchArgsBuffer!, 
                                        indirectDispatchArgsOffsetByUInts * 4);
    }
}
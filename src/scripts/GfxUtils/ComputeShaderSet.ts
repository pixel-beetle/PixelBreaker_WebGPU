import * as BABYLON from 'babylonjs';
import { WGSLShaderReflection } from "./WGSLShaderReflection";
import { WgslReflect } from 'wgsl_reflect';

export class ComputeShaderKernel
{
    public name: string | null = null;
    public workgroupSizeX : number = 0;
    public workgroupSizeY : number = 0;
    public workgroupSizeZ : number = 0;

    public computeShadersSource: string | null = null;
    public bindings: Record<string, { group: number; binding: number }> | null = null;

    public CreateComputeShader( engine: BABYLON.AbstractEngine ) : BABYLON.ComputeShader | null
    {
        this._computeShader = new BABYLON.ComputeShader(this.name!, engine, 
        { 
            // babylon uses computeSource directly as the unique identifier for a compute effect
            // since we want to generate compute kernels from the same compute file,
            // we have to add a name comment to make it unique for each kernel
            computeSource: "//ComputeShader: " + this.name! + "\n" + this.computeShadersSource!,
         },
        { 
            bindingsMapping: this.bindings!, 
            entryPoint: this.name!,
        }
        );
        this._computeShader.onError = (effect: BABYLON.ComputeEffect, message: string) => {
            console.error(`ComputeShader ${this.name} error: ${message}`);
        };
        return this._computeShader;
    }

    private _computeShader: BABYLON.ComputeShader | null = null;

    public get cs() : BABYLON.ComputeShader | null
    {
        return this._computeShader;
    }
}


export class ComputeShaderSet
{
    private _kernels: Map<string, ComputeShaderKernel> = new Map();
    private _shaderReflection: WgslReflect | null = null;

    public InitializeStructUBO(ubo: BABYLON.UniformBuffer, structUboIndexInShader: number = 0)
    {
        if (!this._shaderReflection)
            return;
        const uniforms = this._shaderReflection.uniforms;
        if (!uniforms)
            return;

        let structUbosInShader = [];

        for (let i = 0; i < uniforms.length; i++)
        {
            const uniform = uniforms[i];
            if (!uniform.isStruct || !uniform.members)
                continue;
            structUbosInShader.push(uniform);
        }

        const structUbo = structUbosInShader[structUboIndexInShader];
        if (!structUbo)
            return;

        for (const member of structUbo.members!)
        {
            const sizeNum32 = member.size / 4;
            ubo.addUniform(member.name, sizeNum32);
        }
        ubo.create();
    }

    public IsAllKernelsReady() : boolean
    {
        for (const kernel of this._kernels.values())
        {
            if (!kernel.cs || !kernel.cs.isReady())
                return false;
        }
        return true;
    }

    public GetKernel(name: string) : ComputeShaderKernel | null
    {
        return this._kernels.get(name) ?? null;
    }

    public static Create(computeShadersSource: string, engine: BABYLON.AbstractEngine) : ComputeShaderSet
    {
        const ret = new ComputeShaderSet();
        const shaderReflection = new WgslReflect(computeShadersSource);
        const entryPoints = WGSLShaderReflection.ExtractComputeEntryPoints(computeShadersSource);
        const bindGroups = shaderReflection.getBindGroups();
        ret._shaderReflection = shaderReflection;

        for (const entryPoint of entryPoints)
        {
            const computeShaderKernel = new ComputeShaderKernel();
            computeShaderKernel.computeShadersSource = computeShadersSource;
            computeShaderKernel.name = entryPoint.name;
            computeShaderKernel.workgroupSizeX = entryPoint.workgroupSize.x;
            computeShaderKernel.workgroupSizeY = entryPoint.workgroupSize.y;
            computeShaderKernel.workgroupSizeZ = entryPoint.workgroupSize.z;

            const kernelFunction = shaderReflection.getFunctionInfo(entryPoint.name);
            const resourceVariableList = kernelFunction?.resources!;
            
            
            if (!resourceVariableList)
            {
                console.warn(`Failed to get resource variable list for ${entryPoint.name}`);
                throw new Error(`Failed to get resource variable list for ${entryPoint.name}`);
            }

            const bindings: Record<string, { group: number; binding: number }> = {};
            for (const variable of resourceVariableList)
            {
                bindings[variable.name] = { group: variable.group, binding: variable.binding };
            }
            computeShaderKernel.bindings = bindings;

            ret._kernels.set(entryPoint.name, computeShaderKernel);
            computeShaderKernel.CreateComputeShader(engine);
        }

        return ret;
    }
}
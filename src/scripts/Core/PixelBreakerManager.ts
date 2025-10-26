

import * as BABYLON from 'babylonjs';
import { StorageBuffer, UniformBuffer } from "babylonjs";
import { DoubleBufferedStorageBuffer } from "../GfxUtils/DoubleBufferUtils";
import { IndirectArgsBuffer } from "../GfxUtils/IndirectArgsBuffer";
import { ComputeShaderSet } from "../GfxUtils/ComputeShaderSet";
import pixelBreakerComputeShader from "../../Shaders/PixelBreaker.compute.wgsl";
import pixelBreakerRenderVS from "../../Shaders/PixelBreaker.render.vs.wgsl";
import pixelBreakerRenderFS from "../../Shaders/PixelBreaker.render.fs.wgsl";
import { SharedTextureSamplerCollection } from "../GfxUtils/SharedTextureSampler";
import { UIBinding, UIGradient } from '../GUI/UIProperty';
import { GradientUtils, GradientTexture } from '../GfxUtils/ColorGradient';
import { GradientBladeParams, Gradient } from 'tweakpane-plugin-gradient';
import { GPUSpatialHashTable } from './GPUSpatialHashTable';


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

    public GetScaleFactorForResolutionIndependentDistanceParams() : number
    {
        return this.height;
    }

    public GetScaleFactorForResolutionIndependentForceParams() : number
    {
        return this.height * 0.25;
    }

    public GetScaleFactorForResolutionIndependentSpeedParams() : number
    {
        return this.height * 0.05;
    }

    public GetScaleFactorForResolutionIndependentParticleSizeParams() : number
    {
        return this.height / 360;
    }
}

export class ParticleCountReadbackBuffer
{
    public buffer = new Uint32Array(3);
    
    @UIBinding({category: "Particle Count",
                bindingParams: { label: "Dynamic", readonly: true, format: (value: number) => { return value.toFixed(); } } })
    public dynamicParticleCount: number = 0;

    @UIBinding({category: "Particle Count", 
                bindingParams: { label: "Static", readonly: true, format: (value: number) => { return value.toFixed(); } } })
    public staticParticleCount: number = 0;


    public Update()
    {
        this.dynamicParticleCount = this.buffer[0];
        this.staticParticleCount = this.buffer[1];
    }
}

export class PixelBreakerBoardParams
{
    @UIBinding({bindingParams: { label: "Move Speed", min: 0, max: 10, step: 0.001 } })
    public reflectionBoardMoveSpeed: number = 2;
    @UIBinding({bindingParams: { label: "Y Position", x: { min: 0, max: 1, step: 0.01 }, y: { min: 0, max: 1, step: 0.01 } } })
    public reflectionBoardPosY01: number = 0.1;
    @UIBinding({bindingParams: { label: "Size", x: { min: 0, max: 1, step: 0.01 }, y: { min: 0, max: 1, step: 0.01 } } })
    public reflectionBoardSize01 : BABYLON.Vector2 = new BABYLON.Vector2(0.0, 0.0);
    @UIBinding({bindingParams: { label: "Color", color : { type: 'float', alpha: true } } } )
    public reflectionBoardColor: BABYLON.Color4 = new BABYLON.Color4(0.95, 0.27, 0.74, 1.0);

    private _reflectionBoardPosX01 : number = 0.5;

    public reflectionBoardRectMin01: BABYLON.Vector2 = new BABYLON.Vector2(0.4, 0.1);
    public reflectionBoardRectMax01: BABYLON.Vector2 = new BABYLON.Vector2(0.6, 0.1);

    public scene: BABYLON.Scene | null = null;

    public OnGetInput(direction: number = 0)
    {
        const deltaTimeSeconds = this.scene!.deltaTime * 0.001;
        this._reflectionBoardPosX01 += direction * this.reflectionBoardMoveSpeed * deltaTimeSeconds;
        this._reflectionBoardPosX01 = Math.max(0, Math.min(1, this._reflectionBoardPosX01));
        this.UpdateReflectionBoardRect();
    }

    public UpdateReflectionBoardRect()
    {
        let centerY = this.reflectionBoardPosY01;
        let size = this.reflectionBoardSize01;
        let centerX = this._reflectionBoardPosX01;

        let minX = centerX - size.x * 0.5;
        let maxX = centerX + size.x * 0.5;
        let minY = centerY - size.y * 0.5;
        let maxY = centerY + size.y * 0.5;

        this.reflectionBoardRectMin01 = new BABYLON.Vector2(minX, minY);
        this.reflectionBoardRectMax01 = new BABYLON.Vector2(maxX, maxY);
    }

    public HandlePropertyChange(property: string, value: any, pixelBreakerManager: PixelBreakerManager)
    {
        switch (property) 
        {
            case "reflectionBoardPosY01":
                this.reflectionBoardPosY01 = value;
                this.UpdateReflectionBoardRect();
                break;
            case "reflectionBoardSize01":
                this.reflectionBoardSize01 = value;
                this.UpdateReflectionBoardRect();
                break;
            case "reflectionBoardColor":
                this.reflectionBoardColor = value;
                break;
        }
    }
}


export class PixelBreakerParticlesParams
{
    @UIBinding({containerPath: "#T/%Spawn/@Static Particle", bindingParams: { label: "Spawn Rect Min", x: { min: 0, max: 1, step: 0.01 }, y: { min: 0, max: 1, step: 0.01 } } })
    public staticParticleSpawnRectMin01: BABYLON.Vector2 = new BABYLON.Vector2(0.2, 0.2);
    @UIBinding({containerPath: "#T/%Spawn/@Static Particle", bindingParams: { label: "Spawn Rect Max", x: { min: 0, max: 1, step: 0.01 }, y: { min: 0, max: 1, step: 0.01 } } })
    public staticParticleSpawnRectMax01: BABYLON.Vector2 = new BABYLON.Vector2(0.8, 0.99);
    
    @UIBinding({containerPath: "#T/%Spawn/@Dynamic Particle", bindingParams: { label: "Spawn Count", min:0, format: (value: number) => { return value.toFixed(); } } })
    public dynamicParticleInitialCount: number = 1000000;

    @UIBinding({containerPath: "#T/%Spawn/@Dynamic Particle", bindingParams: { label: "Spawn Speed", min:0 } })
    public dynamicParticleInitialSpeed : number = 5;

    @UIGradient({containerPath: "#T/%Spawn/@Color", label: "Particle Spawn Color" })
    public particleSpawnColorGradient: Gradient = GradientUtils.HSV(24);

    @UIBinding({containerPath: "#T/%Spawn/@Color", bindingParams: { label: "Particle Color Tint", color : { type: 'float' } } } )
    public particleColorTint: BABYLON.Color4 = new BABYLON.Color4(1.0, 1.0, 1.0, 1.0);

    @UIBinding({containerPath: "#T/%Update/#TT/%Speed", bindingParams: { label: "Min Speed", min:0 } })
    public dynamicParticleMinSpeed: number = 16;
    
    @UIBinding({containerPath: "#T/%Update/#TT/%Speed", bindingParams: { label: "Max Speed", min:0 } })
    public dynamicParticleMaxSpeed: number = 20;


    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@SDF Force", bindingParams: { label: "Enable", type: 'boolean' } })
    public useDistanceFieldForce : boolean = true;
    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@SDF Force", bindingParams: { label: "Collision Strength" } })
    public distanceFieldCollisionStrength : number = 150;
    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@SDF Force", bindingParams: { label: "Swirl Strength(Outside)" } })
    public distanceFieldSwirlStrength : number = 15;
    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@SDF Force", bindingParams: { label: "Swirl Strength(Inside)" } })
    public distanceFieldInsideSwirlStrength : number = 8;

    @UIBinding({containerPath: "#T/%Update/#TT/%Color/@Force By Color", bindingParams: { label: "Strength" } })
    public forceByColorStrength : number = 8.0;

    @UIBinding({containerPath: "#T/%Update/#TT/%Color/@Force By Color", bindingParams: { label: "Dir Rotation Offset", min: 0, max: 6.28, step: 0.01 } })
    public forceByColorDirRotationOffset: number = 1.5;

    @UIBinding({containerPath: "#T/%Update/#TT/%Color/@Color Change When Collide With", bindingParams: { label: "Reflection Board", min: 0, max: 1, step: 0.01 } })
    public colorChangeWhenCollideWithReflectionBoard : number = 0;
    
    @UIBinding({containerPath: "#T/%Update/#TT/%Color/@Color Change When Collide With", bindingParams: { label: "Static Particles", min: 0, max: 1, step: 0.01 } })
    public colorChangeWhenCollideWithStaticParticle : number = 0;


    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@Inter-Particle Forces", bindingParams: { label: "Enable", type: 'boolean' } })
    public useInterParticleForces : boolean = true;
    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@Inter-Particle Forces", bindingParams: { label: "Particle Radius", min: 1, max: 64, step: 1 } })
    public interParticleForcesParticleRadius : number = 4;
    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@Inter-Particle Forces", bindingParams: { label: "Max Iterations", min: 1, max: 512, step: 1, format: (value: number) => { return value.toFixed(); } } })
    public interParticleForcesMaxIterationCount : number = 256;
    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@Inter-Particle Forces", bindingParams: { label: "Max Neighbor Checks Per Cell", min: 1, max: 256, step: 1, format: (value: number) => { return value.toFixed(); } } })
    public interParticleForcesMaxCheckedParticleCountPerCell : number = 8;
    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@Inter-Particle Forces/@Separation", bindingParams: { label: "Enable", type: 'boolean' } })
    public useSeparationForce : boolean = true;
    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@Inter-Particle Forces/@Separation", bindingParams: { label: "Strength" } })
    public separationStrength : number = 50;
    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@Inter-Particle Forces/@Separation", bindingParams: { label: "Distance" } })
    public separationDistanceThreshold : number = 4;
    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@Inter-Particle Forces/@Separation", bindingParams: { label: "Falloff Exponent" } })
    public separationFalloffExponent : number = 1.0;

    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@Inter-Particle Forces/@Alignment", bindingParams: { label: "Enable", type: 'boolean' } })
    public useAlignmentForce : boolean = true;
    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@Inter-Particle Forces/@Alignment", bindingParams: { label: "Strength" } })
    public alignmentStrength : number = 20;
    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@Inter-Particle Forces/@Alignment", bindingParams: { label: "Distance" } })
    public alignmentDistanceThreshold : number = 8;

    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@Inter-Particle Forces/@Cohesion", bindingParams: { label: "Enable", type: 'boolean' } })
    public useCohesionForce : boolean = true;
    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@Inter-Particle Forces/@Cohesion", bindingParams: { label: "Strength" } })
    public cohesionStrength : number = 10;
    @UIBinding({containerPath: "#T/%Update/#TT/%Force/@Inter-Particle Forces/@Cohesion", bindingParams: { label: "Distance" } })
    public cohesionDistanceThreshold : number = 16;

    @UIBinding({containerPath: "#T/%Render/@Size", bindingParams: { label: "Render Size", min: 1, max: 32, step:1, format: (value: number) => { return value.toFixed(); } } })
    public dynamicParticleSize: number = 1;

    @UIBinding({containerPath: "#T/%Render/@Trail", bindingParams: { label: "Trail Fade Rate", min: 0.001, max: 1.0, step: 0.001 } })
    public trailFadeRate : number = 0.6;

    @UIBinding({containerPath: "#T/%Render/@Blend", bindingParams: { label: "Particle Blend Mode", min: 0, max: 5, options:{
        "Stable Sort": 0,
        "Random": 1,
        "Additive": 2,
    } , format: (value: number) => { return value.toFixed(); } } })
    public particleBlendMode: number = 0;
    @UIBinding({containerPath: "#T/%Render/@Blend", bindingParams: { label: "Sorting Peak Count", min: 1, max: 16, step: 1, format: (value: number) => { return value.toFixed(); } } })
    public sortingPeakCount: number = 4;
    @UIBinding({containerPath: "#T/%Render/@Blend", bindingParams: { label: "Sorting Shift Speed", min: 0.00001, max: 0.001, step: 0.00001 } })
    public sortingShiftSpeed: number = 0.0003;

    @UIGradient({containerPath: "#T/%Render/@Speed Visualize", label: "Color Gradient" })
    public particleColorBySpeedGradient: Gradient = GradientUtils.Viridis();

    @UIBinding({containerPath: "#T/%Render/@Speed Visualize", bindingParams: { label: "Remap Range" } })
    public colorBySpeedRamapRange: BABYLON.Vector2 = new BABYLON.Vector2(0, 10);

    @UIBinding({containerPath: "#T/%Render/@Speed Visualize", bindingParams: { label: "Factor", min: 0, max: 1, step: 0.01 } })
    public colorBySpeedFactor: number = 0.0;


    public HandlePropertyChange(property: string, value: any, pixelBreakerManager: PixelBreakerManager)
    {
        switch (property) 
        {
            case "dynamicParticleInitialCount":
                this.dynamicParticleInitialCount = value;
                break;
            case "staticParticleSpawnRectMin01":
                this.staticParticleSpawnRectMin01 = value;
                break;
            case "staticParticleSpawnRectMax01":
                this.staticParticleSpawnRectMax01 = value;
                break;
            case "colorChangeWhenCollideWithReflectionBoard":
                this.colorChangeWhenCollideWithReflectionBoard = value;
                break;
            case "colorChangeWhenCollideWithStaticParticle":
                this.colorChangeWhenCollideWithStaticParticle = value;
                break;
            case "useDistanceFieldForce":
                this.useDistanceFieldForce = value;
                break;
            case "distanceFieldCollisionStrength":
                this.distanceFieldCollisionStrength = value;
                break;
            case "distanceFieldSwirlStrength":
                this.distanceFieldSwirlStrength = value;
                break;
            case "distanceFieldInsideSwirlStrength":
                this.distanceFieldInsideSwirlStrength = value;
                break;
            case "useInterParticleForces":
                this.useInterParticleForces = value;
                break;
            case "interParticleForcesParticleRadius":
                this.interParticleForcesParticleRadius = value;
                break;
            case "interParticleForcesMaxIterationCount":
                this.interParticleForcesMaxIterationCount = value;
                break;
            case "interParticleForcesMaxCheckedParticleCountPerCell":
                this.interParticleForcesMaxCheckedParticleCountPerCell = value;
                break;
            case "useSeparationForce":
                this.useSeparationForce = value;
                break;
            case "separationStrength":
                this.separationStrength = value;
                break;
            case "separationDistanceThreshold":
                this.separationDistanceThreshold = value;
                break;
            case "separationFalloffExponent":
                this.separationFalloffExponent = value;
                break;
            case "useAlignmentForce":
                this.useAlignmentForce = value;
                break;
            case "alignmentStrength":
                this.alignmentStrength = value;
                break;
            case "alignmentDistanceThreshold":
                this.alignmentDistanceThreshold = value;
                break;
            case "useCohesionForce":
                this.useCohesionForce = value;
                break;
            case "cohesionStrength":
                this.cohesionStrength = value;
                break;
            case "cohesionDistanceThreshold":
                this.cohesionDistanceThreshold = value;
                break;
            case "dynamicParticleInitialSpeed":
                this.dynamicParticleInitialSpeed = value;
                break;
            case "dynamicParticleMaxSpeed":
                this.dynamicParticleMaxSpeed = value;
                break;
            case "dynamicParticleMinSpeed":
                this.dynamicParticleMinSpeed = value;
                break;
            case "dynamicParticleSize":
                this.dynamicParticleSize = value;
                break;
            case "trailFadeRate":
                this.trailFadeRate = value;
                break;
            case "particleSpawnColorGradient":
                pixelBreakerManager.particleSpawnColorGradientTexture!.UpdateFromTPGradient(value);
                break;
            case "particleColorTint":
                this.particleColorTint = value;
                break;
            case "particleColorBySpeedGradient":
                pixelBreakerManager.particleColorBySpeedGradientTexture!.UpdateFromTPGradient(value);
                break;
            case "colorBySpeedRamapRange":
                this.colorBySpeedRamapRange = value;
                break;
            case "colorBySpeedFactor":
                this.colorBySpeedFactor = value;
                break;
            case "forceByColorStrength":
                this.forceByColorStrength = value;
                break;
            case "forceByColorChangeSpeed":
                this.forceByColorDirRotationOffset = value;
                break;
            case "particleBlendMode":
                this.particleBlendMode = value;
                break;
            case "sortingPeakCount":
                this.sortingPeakCount = value;
                break;
            case "sortingShiftSpeed":
                this.sortingShiftSpeed = value;
                break;
        }
    }
}


export class PixelBreakerMouseInteractionParams
{
    @UIBinding({bindingParams: { label: "Hint Gizmo Thickness", min: 0, max: 5, step: 0.001 } })
    public hintGizmoThickness : number = 0.0;

    @UIBinding({bindingParams: { label: "Radius", min: 0, max: 0.5, step: 0.01 } })
    public radius: number = 0.15;
    
    @UIBinding({bindingParams: { label: "Radius Mouse Wheel Step", min: 0, max: 0.2, step: 0.01 } })
    public radiusWheelStep : number = 0.05;
    
    @UIBinding({bindingParams: { label: "Strength", min: 0, step: 0.01 } })
    public strength: number = 200.0;
    @UIBinding({bindingParams: { label: "Swirl Strength", min: 0, step: 0.01 } })
    public swirlStrength: number = 200.0;
    @UIBinding({bindingParams: { label: "Falloff Exponent", min: 0, step: 0.01 } })
    public falloffExponent: number = 0.5;

    public mousePosition: BABYLON.Vector2 = new BABYLON.Vector2(0, 0);
    public hasWheelAction : boolean = false;
    public button : number = -1;

    public UpdateMousePosition(mousePosition: BABYLON.Vector2)
    {
        this.mousePosition = mousePosition;
    }

    public UpdateRadius(wheelDirection: number)
    {
        this.radius = this.radius + wheelDirection * this.radiusWheelStep;
        this.radius = Math.max(this.radius, 0);
        this.radius = Math.min(this.radius, 0.5);
    }

    public UpdateHasWheelAction(hasAction: boolean)
    {
        this.hasWheelAction = hasAction;
    }

    public UpdateButton(button: number)
    {
        this.button = button;
    }

    public GetMouseStateUniforms(): BABYLON.Vector4
    {
        return new BABYLON.Vector4(this.mousePosition.x, this.mousePosition.y, this.hasWheelAction ? 1 : 0, this.button);
    }

    public GetMouseInteractionParamsUniforms(scaleFactor: number, distanceScaleFactor: number): BABYLON.Vector4
    {
        return new BABYLON.Vector4(this.radius * distanceScaleFactor, 
                    this.strength * scaleFactor, 
                    this.swirlStrength * scaleFactor, 
                    this.falloffExponent);
    }

    public HandlePropertyChange(property: string, value: any, pixelBreakerManager: PixelBreakerManager)
    {
        switch (property) 
        {
            case "hintGizmoThickness":
                this.hintGizmoThickness = value;
                break;
            case "radius":
                this.radius = value;
                break;
            case "radiusWheelStep":
                this.radiusWheelStep = value;
                break;
            case "strength":
                this.strength = value;
                break;
            case "swirlStrength":
                this.swirlStrength = value;
                break;
            case "falloffExponent":
                this.falloffExponent = value;
                break;
        }
    }
}

export class PixelBreakerManager
{
    // Params
    public params: PixelBreakerParticlesParams = new PixelBreakerParticlesParams();
    public boardParams: PixelBreakerBoardParams = new PixelBreakerBoardParams();
    public mouseInteractionParams: PixelBreakerMouseInteractionParams = new PixelBreakerMouseInteractionParams();
    public particleCountReadback: ParticleCountReadbackBuffer = new ParticleCountReadbackBuffer();

    private _particleSpawnColorGradientTexture: GradientTexture | null = null;
    private _particleColorBySpeedGradientTexture: GradientTexture | null = null;
    public get particleSpawnColorGradientTexture(): GradientTexture
    {
        if (!this._particleSpawnColorGradientTexture)
        {
            this._particleSpawnColorGradientTexture = new GradientTexture(256, this._scene!);
        }
        return this._particleSpawnColorGradientTexture;
    }
    public set particleSpawnColorGradientTexture(value: GradientTexture)
    {
        this._particleSpawnColorGradientTexture = value;
    }
    public get particleColorBySpeedGradientTexture(): GradientTexture
    {
        if (!this._particleColorBySpeedGradientTexture)
        {
            this._particleColorBySpeedGradientTexture = new GradientTexture(256, this._scene!);
        }
        return this._particleColorBySpeedGradientTexture;
    }
    public set particleColorBySpeedGradientTexture(value: GradientTexture)
    {
        this._particleColorBySpeedGradientTexture = value;
    }
    // Private States
    private _renderTargetSizeInfo: RenderTargetSizeInfo = new RenderTargetSizeInfo();
    private _staticParticleSpawnRectMin: BABYLON.Vector2 = new BABYLON.Vector2(-1, -1);
    private _staticParticleSpawnRectMax: BABYLON.Vector2 = new BABYLON.Vector2(-1, -1);
    private _reflectionBoardRectMin: BABYLON.Vector2 = new BABYLON.Vector2(-1, -1);
    private _reflectionBoardRectMax: BABYLON.Vector2 = new BABYLON.Vector2(-1, -1);

    private _isInitialiSpawnDone: boolean = false;
    private _time: number = 0;

    // Resources
    private _scene: BABYLON.Scene | null = null;
    private _engine: BABYLON.AbstractEngine | null = null;

    private _gpuSpatialHashTable: GPUSpatialHashTable | null = null;
    private _computeUBO: UniformBuffer | null = null;
    private _renderUBO: UniformBuffer | null = null;
    
    private _particleMemoryBuffer: DoubleBufferedStorageBuffer | null = null;
    private _particleCountBuffer: DoubleBufferedStorageBuffer | null = null;
    private _activeDynamicParticleSlotIndexBuffer: DoubleBufferedStorageBuffer | null = null;
    private _activeStaticParticleSlotIndexBuffer: DoubleBufferedStorageBuffer | null = null;

    private _softwareRasterTargetBuffer: DoubleBufferedStorageBuffer | null = null;

    private _computeShaderSet: ComputeShaderSet | null = null;
    private _sharedTextureSamplerCollection: SharedTextureSamplerCollection | null = null;

    private _indirectDispatchArgsBuffer: IndirectArgsBuffer | null = null;

    private _renderMaterial: BABYLON.ShaderMaterial | null = null;
    public get renderMaterial() : BABYLON.ShaderMaterial | null
    {
        return this._renderMaterial;
    }

    public InitializeIfNeeded(scene: BABYLON.Scene, 
        engine: BABYLON.AbstractEngine,
        renderTargetSize: BABYLON.ISize) : boolean
    {
        this._scene = scene;
        this._engine = engine;
        this.boardParams.scene = scene;
        this.boardParams.UpdateReflectionBoardRect();

        const renderTargetSizeChanged = this._renderTargetSizeInfo.IsDifferent(renderTargetSize);
        this._renderTargetSizeInfo.Update(renderTargetSize);

        if (!this._renderTargetSizeInfo.IsValid())
        {
            console.error("Render target size is not set for PixelBreakerManager");
            return false;
        }

        if (!this._gpuSpatialHashTable)
        {
            this._gpuSpatialHashTable = new GPUSpatialHashTable(this._engine!);
        }

        if (!this._renderUBO)
        {
            this._renderUBO = new UniformBuffer(this._engine);
            this._renderUBO.name = "PixelBreaker Render UniformBuffer";
            this._renderUBO.addUniform("_RenderTargetTexelSize", 4);
            this._renderUBO.addUniform("_ReflectionBoardRectMinMax", 4);
            this._renderUBO.addUniform("_ReflectionBoardColor", 4);
            this._renderUBO.addUniform("_MousePosition", 4);
            this._renderUBO.addUniform("_MouseInteractionParams", 4);
            this._renderUBO.addUniform("_MouseInteractionHintGizmoThickness", 1);
            this._renderUBO.create();
        }
        
        if(!this._computeShaderSet)
        {
            this._computeShaderSet = ComputeShaderSet.Create(pixelBreakerComputeShader, this._engine!);
        }

        if (!this._computeUBO)
        {
            this._computeUBO = new UniformBuffer(this._engine);
            this._computeUBO.name = "PixelBreaker UniformBuffer";
            this._computeShaderSet!.InitializeStructUBO(this._computeUBO, 0);
        }

        if (!this._sharedTextureSamplerCollection)
        {
            this._sharedTextureSamplerCollection = new SharedTextureSamplerCollection();
        }

        // Rebuild Size Related Resources
        if (renderTargetSizeChanged)
        {
            this._isInitialiSpawnDone = false;
            const TOTAL_PARTICLE_CAPACITY = this.params.dynamicParticleInitialCount + this._renderTargetSizeInfo.totalTexelCount;

            if (this._particleMemoryBuffer)
                this._particleMemoryBuffer.Release();
            // UInt Position, UInt Velocity, UInt Color, Atomic UInt Activate State
            const PARTICLE_STATE_SIZE = 4;
            this._particleMemoryBuffer = new DoubleBufferedStorageBuffer(
                this._engine as BABYLON.WebGPUEngine,
                TOTAL_PARTICLE_CAPACITY * PARTICLE_STATE_SIZE,
                BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE | BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE,
                "ParticleMemoryBuffer"
            );
            this._particleMemoryBuffer.Create();

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


            if (this._activeDynamicParticleSlotIndexBuffer)
                this._activeDynamicParticleSlotIndexBuffer.Release();
            this._activeDynamicParticleSlotIndexBuffer = new DoubleBufferedStorageBuffer(
                this._engine as BABYLON.WebGPUEngine,
                TOTAL_PARTICLE_CAPACITY * 1, 
                BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE | BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE,
                "ActiveParticleSlotIndexBuffer"
            );
            this._activeDynamicParticleSlotIndexBuffer.Create();

            if (this._activeStaticParticleSlotIndexBuffer)
                this._activeStaticParticleSlotIndexBuffer.Release();
            this._activeStaticParticleSlotIndexBuffer = new DoubleBufferedStorageBuffer(
                this._engine as BABYLON.WebGPUEngine,
                TOTAL_PARTICLE_CAPACITY * 1, 
                BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE | BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE,
                "ActiveStaticParticleSlotIndexBuffer"
            );
            this._activeStaticParticleSlotIndexBuffer.Create();


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
        if (!this._indirectDispatchArgsBuffer)
        {
            this._indirectDispatchArgsBuffer = new IndirectArgsBuffer(
                this._engine as BABYLON.WebGPUEngine, 
                // [0 ~ 2] = Update Dynamic Particles, 
                // [3 ~ 5] = Update Static Particles, 
                // [6 ~ 8] = Rasterize Static Particles
                // [9 ~ 11] = Rasterize Dynamic Particles
                3 * 4, 
                BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE, 
                "IndirectDispatchArgs"
            );
        }

        if (!this._computeShaderSet!.IsAllKernelsReady())
        {
            console.warn("PixelBreakerManager Compute Shaders are not ready, Update Loop will not be executed");
            return false;
        }

        if (!this._renderMaterial)
        {
            const material = new BABYLON.ShaderMaterial("PixelBreakerRender", 
                this._scene!, 
                {
                    vertexSource: "// VS\n" + pixelBreakerRenderVS,
                    fragmentSource: "// FS\n" + pixelBreakerRenderFS,
                }, 
                {
                    attributes: ["position", "uv"],
                    uniformBuffers: ["Scene", "Mesh"],
                    shaderLanguage: BABYLON.ShaderLanguage.WGSL,
                });
            this._renderMaterial = material;
        }


        this.particleSpawnColorGradientTexture.UpdateFromTPGradient(this.params.particleSpawnColorGradient);
        this.particleColorBySpeedGradientTexture.UpdateFromTPGradient(this.params.particleColorBySpeedGradient);

        return true;
    }

    public Release(releaseGradientTextures: boolean = true)
    {
        if (this._computeUBO)
            this._computeUBO.dispose();

        if (this._renderUBO)
            this._renderUBO.dispose();

        if (this._particleMemoryBuffer)
            this._particleMemoryBuffer.Release();
        
        if (this._particleCountBuffer)
            this._particleCountBuffer.Release();

        if (this._activeDynamicParticleSlotIndexBuffer)
            this._activeDynamicParticleSlotIndexBuffer.Release();

        if (this._activeStaticParticleSlotIndexBuffer)
            this._activeStaticParticleSlotIndexBuffer.Release();

        if (this._softwareRasterTargetBuffer)
            this._softwareRasterTargetBuffer.Release();

        if (this._indirectDispatchArgsBuffer)
            this._indirectDispatchArgsBuffer.Release();

        if (releaseGradientTextures)
        {
            if (this.particleSpawnColorGradientTexture)
                this.particleSpawnColorGradientTexture.Release();
            if (this.particleColorBySpeedGradientTexture)
                this.particleColorBySpeedGradientTexture.Release();
            this._particleSpawnColorGradientTexture = null;
            this._particleColorBySpeedGradientTexture = null;
        }

        if (this._gpuSpatialHashTable)
            this._gpuSpatialHashTable.Release();

        this._gpuSpatialHashTable = null;

        this._computeUBO = null;
        this._renderUBO = null;
        this._particleMemoryBuffer = null;
        this._particleCountBuffer = null;
        this._activeDynamicParticleSlotIndexBuffer = null;
        this._activeStaticParticleSlotIndexBuffer = null;
        this._softwareRasterTargetBuffer = null;
        this._computeShaderSet = null;
        this._indirectDispatchArgsBuffer = null;
        this._scene = null;
        this._engine = null;
        this._sharedTextureSamplerCollection = null;
        this._renderTargetSizeInfo = new RenderTargetSizeInfo();
        this._isInitialiSpawnDone = false;
        this._time = 0;
    }


    public Reset() : void
    {
        this.Release(false);
    }

    private UpdateComputeUBO_BasicParams(speedScaleFactor: number, forceScaleFactor: number, distanceScaleFactor: number)
    {
        if (!this._computeUBO)
            return;
        this._computeUBO.updateFloat("_Time", this._time);
        this._computeUBO.updateFloat("_DeltaTime", this._scene!.deltaTime * 0.001);
        this._computeUBO.updateVector4("_RenderTargetTexelSize", this._renderTargetSizeInfo.texelSize);
        this._computeUBO.updateUInt("_TotalParticleCapacity", this.params.dynamicParticleInitialCount + this._renderTargetSizeInfo.totalTexelCount);
        this._computeUBO.updateUInt("_DynamicParticleInitialCount", this.params.dynamicParticleInitialCount);
        this._computeUBO.updateFloat("_DynamicParticleSize", this.params.dynamicParticleSize);

        const dynamicParticleSpeedParams = new BABYLON.Vector4(
            this.params.dynamicParticleInitialSpeed * speedScaleFactor, 
            this.params.dynamicParticleMinSpeed * speedScaleFactor, 
            this.params.dynamicParticleMaxSpeed * speedScaleFactor, 
            0.0
        );

        this._computeUBO.updateVector4("_DynamicParticleSpeedParams", dynamicParticleSpeedParams);
        
        this._staticParticleSpawnRectMin = new BABYLON.Vector2(
            this.params.staticParticleSpawnRectMin01.x * this._renderTargetSizeInfo.width, 
            this.params.staticParticleSpawnRectMin01.y * this._renderTargetSizeInfo.height
        );
        this._staticParticleSpawnRectMax = new BABYLON.Vector2(
            this.params.staticParticleSpawnRectMax01.x * this._renderTargetSizeInfo.width, 
            this.params.staticParticleSpawnRectMax01.y * this._renderTargetSizeInfo.height
        );
        this._reflectionBoardRectMin = new BABYLON.Vector2(
            this.boardParams.reflectionBoardRectMin01.x * this._renderTargetSizeInfo.width, 
            this.boardParams.reflectionBoardRectMin01.y * this._renderTargetSizeInfo.height
        );
        this._reflectionBoardRectMax = new BABYLON.Vector2(
            this.boardParams.reflectionBoardRectMax01.x * this._renderTargetSizeInfo.width, 
            this.boardParams.reflectionBoardRectMax01.y * this._renderTargetSizeInfo.height
        );
        
        const staticParticleSpawnRectMinMax = new BABYLON.Vector4(
            this._staticParticleSpawnRectMin.x, 
            this._staticParticleSpawnRectMin.y, 
            this._staticParticleSpawnRectMax.x, 
            this._staticParticleSpawnRectMax.y,
        );
        this._computeUBO.updateVector4("_StaticParticleSpawnRectMinMax", staticParticleSpawnRectMinMax);
    }

    private UpdateComputeUBO_ReflectionBoardParams()
    {
        if (!this._computeUBO)
            return;
        const reflectionBoardRectMinMax = new BABYLON.Vector4(
            this._reflectionBoardRectMin.x, 
            this._reflectionBoardRectMin.y, 
            this._reflectionBoardRectMax.x, 
            this._reflectionBoardRectMax.y
        );
        const reflectionBoardColor = new BABYLON.Vector4(this.boardParams.reflectionBoardColor.r, this.boardParams.reflectionBoardColor.g, this.boardParams.reflectionBoardColor.b, this.boardParams.reflectionBoardColor.a);
        this._computeUBO.updateVector4("_ReflectionBoardRectMinMax", reflectionBoardRectMinMax);
        this._computeUBO.updateVector4("_ReflectionBoardColor", reflectionBoardColor);
    }

    private UpdateComputeUBO_DistanceFieldForce(forceScaleFactor: number, distanceScaleFactor: number)
    {
        if (!this._computeUBO)
            return;
        const distanceFieldForceParams = new BABYLON.Vector4(this.params.useDistanceFieldForce ? 1 : 0, 
            this.params.distanceFieldCollisionStrength * forceScaleFactor, 
            this.params.distanceFieldSwirlStrength * forceScaleFactor, 
            this.params.distanceFieldInsideSwirlStrength * forceScaleFactor);
        this._computeUBO.updateVector4("_DistanceFieldForceParams", distanceFieldForceParams);
    }

    private UpdateComputeUBO_MouseInteraction(forceScaleFactor: number, distanceScaleFactor: number)
    {
        if (!this._computeUBO)
            return;

        const mouseInteractionParams = this.mouseInteractionParams.GetMouseInteractionParamsUniforms(forceScaleFactor, distanceScaleFactor);
        const mouseState = this.mouseInteractionParams.GetMouseStateUniforms();
        this._computeUBO.updateVector4("_MousePosition", mouseState);
        this._computeUBO.updateVector4("_MouseInteractionParams", mouseInteractionParams);
    }

    private UpdateComputeUBO_SHT(forceScaleFactor: number, distanceScaleFactor: number, particleSizeScaleFactor: number)
    {
        if (!this._computeUBO)
            return;
        if (this._gpuSpatialHashTable)
        {
            this._computeUBO.updateFloat("_SHT_GridSize", this.params.interParticleForcesParticleRadius * 2.0 * particleSizeScaleFactor);
            this._computeUBO.updateUInt("_SHT_TableEntryCount", this._gpuSpatialHashTable.tableEntryCount);
        }
    }

    private UpdateComputeUBO_InterParticleForces(forceScaleFactor: number, distanceScaleFactor: number, particleSizeScaleFactor: number)
    {
        if (!this._computeUBO)
            return;
        let interParticleForcesParams = new BABYLON.Vector4(
            this.params.useInterParticleForces ? 1 : 0,
            this.params.interParticleForcesParticleRadius * particleSizeScaleFactor,
            this.params.interParticleForcesMaxIterationCount,
            this.params.interParticleForcesMaxCheckedParticleCountPerCell
        );
        this._computeUBO.updateVector4("_InterParticleForceParams_Base", interParticleForcesParams);
        let separationParams = new BABYLON.Vector4(
            this.params.useSeparationForce ? 1 : 0,
            this.params.separationStrength * forceScaleFactor,
            this.params.separationDistanceThreshold * particleSizeScaleFactor,
            this.params.separationFalloffExponent
        );
        this._computeUBO.updateVector4("_InterParticleForceParams_Separation", separationParams);
        let alignmentParams = new BABYLON.Vector4(
            this.params.useAlignmentForce ? 1 : 0,
            this.params.alignmentStrength * forceScaleFactor,
            this.params.alignmentDistanceThreshold * particleSizeScaleFactor,
            0.0
        );
        this._computeUBO.updateVector4("_InterParticleForceParams_Alignment", alignmentParams);
        let cohesionParams = new BABYLON.Vector4(
            this.params.useCohesionForce ? 1 : 0,
            this.params.cohesionStrength * forceScaleFactor,
            this.params.cohesionDistanceThreshold * particleSizeScaleFactor,
            0.0
        );
        this._computeUBO.updateVector4("_InterParticleForceParams_Cohesion", cohesionParams);
    }

    private UpdateComputeUBO_Coloring(speedScaleFactor: number, forceScaleFactor: number)
    {
        if (!this._computeUBO)
            return;
        const particleColorTint = new BABYLON.Vector4(
            this.params.particleColorTint.r, 
            this.params.particleColorTint.g, 
            this.params.particleColorTint.b, 
            this.params.particleColorTint.a
        );
        this._computeUBO.updateVector4("_ParticleColorTint", particleColorTint);

        const colorBySpeedParams = new BABYLON.Vector4(
            this.params.colorBySpeedRamapRange.x * speedScaleFactor, 
            this.params.colorBySpeedRamapRange.y * speedScaleFactor, 
            0, 
            this.params.colorBySpeedFactor);
        this._computeUBO.updateVector4("_ColorBySpeedParams", colorBySpeedParams);

        const colorByCollisionParams = new BABYLON.Vector4(this.params.colorChangeWhenCollideWithReflectionBoard, this.params.colorChangeWhenCollideWithStaticParticle, 0, 0);
        this._computeUBO.updateVector4("_ColorByCollisionParams", colorByCollisionParams);

        const forceByColorParams = new BABYLON.Vector4(
            this.params.forceByColorStrength * forceScaleFactor, 
            this.params.forceByColorDirRotationOffset, 
            0, 
            0);
        this._computeUBO.updateVector4("_ForceByColorParams", forceByColorParams);
    }

    private UpdateComputeUBO_SoftwareRasterRender()
    {
        if (!this._computeUBO)
            return;
        const softwareRasterizeSortingParams = new BABYLON.Vector4(
            this.params.sortingPeakCount, 
            this.params.sortingShiftSpeed, 
            this.params.particleBlendMode, 
            0);
        this._computeUBO.updateVector4("_SoftwareRasterizeSortingParams", softwareRasterizeSortingParams);
        this._computeUBO.updateFloat("_TrailFadeRate", this.params.trailFadeRate);
    }

    private UpdateComputeUBO()
    {
        if (!this._computeUBO)
            return;
        const forceScaleFactor = this._renderTargetSizeInfo.GetScaleFactorForResolutionIndependentForceParams();
        const speedScaleFactor = this._renderTargetSizeInfo.GetScaleFactorForResolutionIndependentSpeedParams();
        const distanceScaleFactor = this._renderTargetSizeInfo.GetScaleFactorForResolutionIndependentDistanceParams();
        const particleSizeScaleFactor = this._renderTargetSizeInfo.GetScaleFactorForResolutionIndependentParticleSizeParams();
        this.UpdateComputeUBO_BasicParams(speedScaleFactor, forceScaleFactor, distanceScaleFactor);
        this.UpdateComputeUBO_ReflectionBoardParams();
        this.UpdateComputeUBO_Coloring(speedScaleFactor, forceScaleFactor);
        this.UpdateComputeUBO_SoftwareRasterRender();
        this.UpdateComputeUBO_DistanceFieldForce(forceScaleFactor, distanceScaleFactor);
        this.UpdateComputeUBO_SHT(forceScaleFactor, distanceScaleFactor, particleSizeScaleFactor);
        this.UpdateComputeUBO_MouseInteraction(forceScaleFactor, distanceScaleFactor);
        this.UpdateComputeUBO_InterParticleForces(forceScaleFactor, distanceScaleFactor, particleSizeScaleFactor);

        this._computeUBO.update();
    }

    private UpdateRenderUBO()
    {
        if (!this._renderUBO)
            return;
        const forceScaleFactor = this._renderTargetSizeInfo.GetScaleFactorForResolutionIndependentForceParams();
        const distanceScaleFactor = this._renderTargetSizeInfo.GetScaleFactorForResolutionIndependentDistanceParams();

        const reflectionBoardColor = new BABYLON.Vector4(this.boardParams.reflectionBoardColor.r, this.boardParams.reflectionBoardColor.g, this.boardParams.reflectionBoardColor.b, this.boardParams.reflectionBoardColor.a);
        const reflectionBoardRectMinMax = new BABYLON.Vector4(
            this._reflectionBoardRectMin.x, 
            this._reflectionBoardRectMin.y, 
            this._reflectionBoardRectMax.x, 
            this._reflectionBoardRectMax.y
        );

        this._renderUBO.updateVector4("_RenderTargetTexelSize", this._renderTargetSizeInfo.texelSize);
        this._renderUBO.updateVector4("_ReflectionBoardRectMinMax", reflectionBoardRectMinMax);
        this._renderUBO.updateVector4("_ReflectionBoardColor", reflectionBoardColor);

        const mouseInteractionParams = this.mouseInteractionParams.GetMouseInteractionParamsUniforms(forceScaleFactor, distanceScaleFactor);
        const mouseState = this.mouseInteractionParams.GetMouseStateUniforms();
        this._renderUBO.updateVector4("_MousePosition", mouseState);
        this._renderUBO.updateVector4("_MouseInteractionParams", mouseInteractionParams);
        this._renderUBO.updateFloat("_MouseInteractionHintGizmoThickness", this.mouseInteractionParams.hintGizmoThickness);

        this._renderUBO.update();
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

        this._time += this._scene!.deltaTime;
        this.UpdateComputeUBO();

        if (!this._isInitialiSpawnDone)
        {
            this._isInitialiSpawnDone = this.DispatchParticleInitSpawn();
            this.DispatchFillIndirectArgs();
            this.DispatchParticleSoftwareRasterize();
            this.UpdateRenderMaterial();
            return;
        }

        this._particleMemoryBuffer!.Swap();
        this._particleCountBuffer!.Swap();
        this._activeDynamicParticleSlotIndexBuffer!.Swap();
        this._activeStaticParticleSlotIndexBuffer!.Swap();
        this._softwareRasterTargetBuffer!.Swap();

        if (this._gpuSpatialHashTable)
        {
            const TOTAL_PARTICLE_CAPACITY = this.params.dynamicParticleInitialCount + this._renderTargetSizeInfo.totalTexelCount;
            this._gpuSpatialHashTable.InitializeIfNeeded(TOTAL_PARTICLE_CAPACITY, this._computeShaderSet!);
            this._gpuSpatialHashTable.DispatchClearTable(this._computeUBO!);
            this._gpuSpatialHashTable.DispatchFillTable(this._computeUBO!, 
                this._particleMemoryBuffer!.Prev()!, 
                this._particleCountBuffer!.Prev()!, 
                this._activeDynamicParticleSlotIndexBuffer!.Prev()!, 
                this._indirectDispatchArgsBuffer!.storageBuffer!,
                0 // use the same indirect args as dynamic particles update
            );
        }
        else
        {
            console.warn("Failed to dispatch spatial hash table, it is not initialized");
        }

        this.DispatchClearParticleCounter();
        this.DispatchUpdateStaticParticles();
        this.DispatchUpdateDynamicParticles(sdfTexture);
        this.DispatchFillIndirectArgs();
        this.DispatchParticleSoftwareRasterize();
        this.UpdateRenderMaterial();

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
        const totalSpawnCount = this.params.dynamicParticleInitialCount + staticParticleSpawnCount;

        kInitialFillParticleCountBuffer!.cs!.setStorageBuffer("_ParticleCountBuffer_RW", this._particleCountBuffer!.Current()!);
        kInitialFillParticleCountBuffer!.cs!.setStorageBuffer("_IndirectDispatchArgsBuffer_RW", this._indirectDispatchArgsBuffer!.storageBuffer);
        kInitialFillParticleCountBuffer!.cs!.dispatch(1, 1, 1);

        kInitialSpawnParticles!.cs!.setUniformBuffer("_Uniforms", this._computeUBO!);
        kInitialSpawnParticles!.cs!.setStorageBuffer("_ParticleMemoryBuffer_RW", this._particleMemoryBuffer!.Current()!);
        kInitialSpawnParticles!.cs!.setStorageBuffer("_ParticleCountBuffer_RW", this._particleCountBuffer!.Current()!);
        kInitialSpawnParticles!.cs!.setStorageBuffer("_ActiveDynamicParticleSlotIndexBuffer_RW", this._activeDynamicParticleSlotIndexBuffer!.Current()!);
        kInitialSpawnParticles!.cs!.setStorageBuffer("_ActiveStaticParticleSlotIndexBuffer_RW", this._activeStaticParticleSlotIndexBuffer!.Current()!);
        
        kInitialSpawnParticles!.cs!.setTexture("_ParticleSpawnColorGradientTexture", this.particleSpawnColorGradientTexture!.texture!, false);
        kInitialSpawnParticles!.cs!.setTextureSampler("_sampler_bilinear_clamp", this._sharedTextureSamplerCollection!.BilinearClamp);

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
        const canClear = kClearParticleCounter!.cs!.dispatch(1, 1, 1);
        if (!canClear)
            console.warn("Failed to clear particle counter");
    }

    private DispatchFillIndirectArgs()
    {
        if (!this._computeShaderSet)
            return;
        const kFillIndirectArgs = this._computeShaderSet.GetKernel("FillIndirectArgs");
        if (!kFillIndirectArgs)
            return;

        kFillIndirectArgs!.cs!.setStorageBuffer("_ParticleCountBuffer_RW", this._particleCountBuffer!.Current()!);
        kFillIndirectArgs!.cs!.setStorageBuffer("_IndirectDispatchArgsBuffer_RW", this._indirectDispatchArgsBuffer!.storageBuffer);
        const canFill = kFillIndirectArgs!.cs!.dispatch(1, 1, 1);
        if (!canFill)
            console.warn("Failed to fill indirect args");
    }


    private _UINT_BYTE_SIZE = 4;

    private DispatchParticleSoftwareRasterize()
    {
        if (!this._computeShaderSet)
            return;

        const kFadeSoftwareRasterizeTarget = this._computeShaderSet.GetKernel("FadeSoftwareRasterizeTarget");
        if (!kFadeSoftwareRasterizeTarget)
            return;
        const kSoftwareRasterizeStaticParticles = this._computeShaderSet.GetKernel("SoftwareRasterizeStaticParticles");
        if (!kSoftwareRasterizeStaticParticles)
            return;
        const kSoftwareRasterizeDynamicParticles = this._computeShaderSet.GetKernel("SoftwareRasterizeDynamicParticles");
        if (!kSoftwareRasterizeDynamicParticles)
            return;


        kFadeSoftwareRasterizeTarget!.cs!.setUniformBuffer("_Uniforms", this._computeUBO!);
        kFadeSoftwareRasterizeTarget!.cs!.setStorageBuffer("_RasterTargetBuffer_R", this._softwareRasterTargetBuffer!.Prev()!);
        kFadeSoftwareRasterizeTarget!.cs!.setStorageBuffer("_RasterTargetBuffer_RW", this._softwareRasterTargetBuffer!.Current()!);
        kFadeSoftwareRasterizeTarget!.cs!.dispatch(
            (this._renderTargetSizeInfo.width + kFadeSoftwareRasterizeTarget!.workgroupSizeX - 1) 
            / kFadeSoftwareRasterizeTarget!.workgroupSizeX,
            (this._renderTargetSizeInfo.height + kFadeSoftwareRasterizeTarget!.workgroupSizeY - 1) 
            / kFadeSoftwareRasterizeTarget!.workgroupSizeY,
            1);

        kSoftwareRasterizeStaticParticles!.cs!.setUniformBuffer("_Uniforms", this._computeUBO!);
        kSoftwareRasterizeStaticParticles!.cs!.setStorageBuffer("_ParticleMemoryBuffer_R", this._particleMemoryBuffer!.Current()!);
        kSoftwareRasterizeStaticParticles!.cs!.setStorageBuffer("_ParticleCountBuffer_RW", this._particleCountBuffer!.Current()!);
        kSoftwareRasterizeStaticParticles!.cs!.setStorageBuffer("_ActiveStaticParticleSlotIndexBuffer_R", this._activeStaticParticleSlotIndexBuffer!.Current()!);
        kSoftwareRasterizeStaticParticles!.cs!.setStorageBuffer("_RasterTargetBuffer_RW", this._softwareRasterTargetBuffer!.Current()!);
        kSoftwareRasterizeStaticParticles!.cs!.dispatchIndirect(this._indirectDispatchArgsBuffer!.storageBuffer, 6 * this._UINT_BYTE_SIZE);
    
    
        kSoftwareRasterizeDynamicParticles!.cs!.setUniformBuffer("_Uniforms", this._computeUBO!);
        kSoftwareRasterizeDynamicParticles!.cs!.setStorageBuffer("_ParticleMemoryBuffer_R", this._particleMemoryBuffer!.Current()!);
        kSoftwareRasterizeDynamicParticles!.cs!.setStorageBuffer("_ParticleCountBuffer_RW", this._particleCountBuffer!.Current()!);
        kSoftwareRasterizeDynamicParticles!.cs!.setStorageBuffer("_ActiveDynamicParticleSlotIndexBuffer_R", this._activeDynamicParticleSlotIndexBuffer!.Current()!);
        kSoftwareRasterizeDynamicParticles!.cs!.setStorageBuffer("_RasterTargetBuffer_RW", this._softwareRasterTargetBuffer!.Current()!);
        kSoftwareRasterizeDynamicParticles!.cs!.setTexture("_ParticleColorBySpeedGradientTexture", this.particleColorBySpeedGradientTexture!.texture!, false);
        kSoftwareRasterizeDynamicParticles!.cs!.setTextureSampler("_sampler_bilinear_clamp", this._sharedTextureSamplerCollection!.BilinearClamp);
        kSoftwareRasterizeDynamicParticles!.cs!.dispatchIndirect(this._indirectDispatchArgsBuffer!.storageBuffer, 9 * this._UINT_BYTE_SIZE);
    }


    private DispatchUpdateDynamicParticles(sdfTexture: BABYLON.Texture | null)
    {
        if (!this._computeShaderSet)
            return;
        const kUpdateDynamicParticles = this._computeShaderSet.GetKernel("UpdateDynamicParticles");
        if (!kUpdateDynamicParticles)
            return;

        kUpdateDynamicParticles!.cs!.setUniformBuffer("_Uniforms", this._computeUBO!);
        kUpdateDynamicParticles!.cs!.setStorageBuffer("_ParticleMemoryBuffer_R", this._particleMemoryBuffer!.Prev()!);
        kUpdateDynamicParticles!.cs!.setStorageBuffer("_ParticleMemoryBuffer_RW", this._particleMemoryBuffer!.Current()!);
        kUpdateDynamicParticles!.cs!.setStorageBuffer("_SHT_TableEntryBuffer_R", this._gpuSpatialHashTable!.tableEntryBuffer!);
        kUpdateDynamicParticles!.cs!.setStorageBuffer("_SHT_TableLinkedListNodesBuffer_R", this._gpuSpatialHashTable!.tableLinkedListNodesBuffer!);
        kUpdateDynamicParticles!.cs!.setStorageBuffer("_ParticleCountBuffer_R", this._particleCountBuffer!.Prev()!);
        kUpdateDynamicParticles!.cs!.setStorageBuffer("_ParticleCountBuffer_RW", this._particleCountBuffer!.Current()!);
        kUpdateDynamicParticles!.cs!.setStorageBuffer("_ActiveDynamicParticleSlotIndexBuffer_R", this._activeDynamicParticleSlotIndexBuffer!.Prev()!);
        kUpdateDynamicParticles!.cs!.setStorageBuffer("_ActiveDynamicParticleSlotIndexBuffer_RW", this._activeDynamicParticleSlotIndexBuffer!.Current()!);
        
        kUpdateDynamicParticles!.cs!.setTexture("_DistanceFieldTexture", sdfTexture!, false);
        kUpdateDynamicParticles!.cs!.setTextureSampler("_sampler_bilinear_clamp", this._sharedTextureSamplerCollection!.BilinearClamp);

        kUpdateDynamicParticles!.cs!.dispatchIndirect(this._indirectDispatchArgsBuffer!.storageBuffer, 0 * this._UINT_BYTE_SIZE);
    }


    private DispatchUpdateStaticParticles()
    {
        if (!this._computeShaderSet)
            return;

        const kUpdateStaticParticles_ConvertPreDynamic = this._computeShaderSet.GetKernel("UpdateStaticParticles_ConvertPreDynamic");
        if (!kUpdateStaticParticles_ConvertPreDynamic)
            return;
        const kUpdateStaticParticles_CollectStatic = this._computeShaderSet.GetKernel("UpdateStaticParticles_CollectStatic");
        if (!kUpdateStaticParticles_CollectStatic)
            return;

        kUpdateStaticParticles_CollectStatic!.cs!.setStorageBuffer("_ParticleMemoryBuffer_R", this._particleMemoryBuffer!.Prev()!);
        kUpdateStaticParticles_CollectStatic!.cs!.setStorageBuffer("_ParticleMemoryBuffer_RW", this._particleMemoryBuffer!.Current()!);
        kUpdateStaticParticles_CollectStatic!.cs!.setStorageBuffer("_ParticleCountBuffer_R", this._particleCountBuffer!.Prev()!);
        kUpdateStaticParticles_CollectStatic!.cs!.setStorageBuffer("_ParticleCountBuffer_RW", this._particleCountBuffer!.Current()!);
        kUpdateStaticParticles_CollectStatic!.cs!.setStorageBuffer("_ActiveStaticParticleSlotIndexBuffer_R", this._activeStaticParticleSlotIndexBuffer!.Prev()!);
        kUpdateStaticParticles_CollectStatic!.cs!.setStorageBuffer("_ActiveStaticParticleSlotIndexBuffer_RW", this._activeStaticParticleSlotIndexBuffer!.Current()!);
        kUpdateStaticParticles_CollectStatic!.cs!.dispatchIndirect(this._indirectDispatchArgsBuffer!.storageBuffer, 3 * this._UINT_BYTE_SIZE);

        kUpdateStaticParticles_ConvertPreDynamic!.cs!.setUniformBuffer("_Uniforms", this._computeUBO!);
        kUpdateStaticParticles_ConvertPreDynamic!.cs!.setStorageBuffer("_ParticleMemoryBuffer_R", this._particleMemoryBuffer!.Prev()!);
        kUpdateStaticParticles_ConvertPreDynamic!.cs!.setStorageBuffer("_ParticleMemoryBuffer_RW", this._particleMemoryBuffer!.Current()!);
        kUpdateStaticParticles_ConvertPreDynamic!.cs!.setStorageBuffer("_ParticleCountBuffer_R", this._particleCountBuffer!.Prev()!);
        kUpdateStaticParticles_ConvertPreDynamic!.cs!.setStorageBuffer("_ParticleCountBuffer_RW", this._particleCountBuffer!.Current()!);
        kUpdateStaticParticles_ConvertPreDynamic!.cs!.setStorageBuffer("_ActiveStaticParticleSlotIndexBuffer_R", this._activeStaticParticleSlotIndexBuffer!.Prev()!);
        kUpdateStaticParticles_ConvertPreDynamic!.cs!.setStorageBuffer("_ActiveDynamicParticleSlotIndexBuffer_RW", this._activeDynamicParticleSlotIndexBuffer!.Current()!);
        kUpdateStaticParticles_ConvertPreDynamic!.cs!.dispatchIndirect(this._indirectDispatchArgsBuffer!.storageBuffer, 3 * this._UINT_BYTE_SIZE);
    }



    private UpdateRenderMaterial()
    {
        if (!this._renderMaterial)
            return;

        this.UpdateRenderUBO();
        this._renderMaterial.setUniformBuffer("_Uniforms", this._renderUBO!);
        this._renderMaterial.setStorageBuffer("_RasterTargetBuffer", this._softwareRasterTargetBuffer!.Current()!);
    }
}
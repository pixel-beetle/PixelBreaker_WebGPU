const kPositionCoordMin = -8192.0;
const kPositionCoordMax = 8192.0;
const kSpeedMin = -8192.0;
const kSpeedMax = 8192.0;

fn PackParticlePosition(positionCoord: vec2<f32>) -> u32
{
    // 16 bit each
    let quantizedX01 = (positionCoord.x - kPositionCoordMin) / (kPositionCoordMax - kPositionCoordMin);
    let quantizedY01 = (positionCoord.y - kPositionCoordMin) / (kPositionCoordMax - kPositionCoordMin);
    let quantizedX = u32(quantizedX01 * 65535.0);
    let quantizedY = u32(quantizedY01 * 65535.0);
    return (quantizedX << 16) | quantizedY;
}

fn UnpackParticlePosition(packedPosition: u32) -> vec2<f32>
{
    let quantizedX = (packedPosition >> 16) & 0xFFFFu;
    let quantizedY = packedPosition & 0xFFFFu;
    return vec2<f32>(kPositionCoordMin + f32(quantizedX) * (kPositionCoordMax - kPositionCoordMin) / 65535.0, 
                    kPositionCoordMin + f32(quantizedY) * (kPositionCoordMax - kPositionCoordMin) / 65535.0);
}

fn PackParticleVelocity(velocity: vec2<f32>) -> u32
{
    // 16 bit each
    let quantizedX01 = (velocity.x - kSpeedMin) / (kSpeedMax - kSpeedMin);
    let quantizedY01 = (velocity.y - kSpeedMin) / (kSpeedMax - kSpeedMin);
    let quantizedX = u32(quantizedX01 * 65535.0);
    let quantizedY = u32(quantizedY01 * 65535.0);
    return (quantizedX << 16) | quantizedY;
}

fn UnpackParticleVelocity(packedVelocity: u32) -> vec2<f32>
{
    let quantizedX = (packedVelocity >> 16) & 0xFFFFu;
    let quantizedY = packedVelocity & 0xFFFFu;
    return vec2<f32>(kSpeedMin + f32(quantizedX) * (kSpeedMax - kSpeedMin) / 65535.0, 
                    kSpeedMin + f32(quantizedY) * (kSpeedMax - kSpeedMin) / 65535.0);
}

fn Hash(input: u32) -> u32 
{
    var state = input * 747796405u + 2891336453u;
    var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}


fn TransformID_2To1_UInt(id: vec2<u32>, size: vec2<u32>) -> u32 
{
    return id.x + id.y * size.x;
}

fn TransformID_2To1_Int(id: vec2<i32>, size: vec2<i32>) -> i32 
{
    return id.x + id.y * size.x;
}

fn TransformID_1To2_UInt(id: u32, size: vec2<u32>) -> vec2<u32>
{
    return vec2<u32>(id % size.x, id / size.x);
}

fn TransformID_1To2_Int(id: i32, size: vec2<i32>) -> vec2<i32>
{
    return vec2<i32>(id % size.x, id / size.x);
}

fn TransformID_1ToUV(id: u32, size: vec2<u32>) -> vec2<f32>
{
    return vec2<f32>(TransformID_1To2_UInt(id, size)) / 
            vec2<f32>(f32(size.x), f32(size.y));
}

fn PackColor(color: vec4<f32>) -> u32
{
    return (u32(color.r * 255.0)) |
            (u32(color.g * 255.0) << 8) |
            (u32(color.b * 255.0) << 16) |
            (u32(color.a * 255.0) << 24);
}

fn UnpackColor(packed: u32) -> vec4<f32>
{
    let r = f32((packed >>  0) & 0xFFu) / 255.0;
    let g = f32((packed >>  8) & 0xFFu) / 255.0;
    let b = f32((packed >> 16) & 0xFFu) / 255.0;
    let a = f32((packed >> 24) & 0xFFu) / 255.0;
    return vec4<f32>(r, g, b, a);
}


struct PackedParticleState
{
    packedPosition: u32,
    packedVelocity: u32,
    packedColor: u32
}

struct ParticleState
{
    position: vec2<f32>,
    velocity: vec2<f32>,
    color: vec4<f32>
}


const PACKED_PARTICLE_STATE_SIZE = 3;


struct Uniforms
{
    _Time: f32,
    _DeltaTime: f32,

    _RenderTargetTexelSize: vec4<f32>,
    
    _TotalParticleCapacity: u32,
    _DynamicParticleInitialCount: u32,

    _ParticleColorTint: vec4<f32>,
    
    _DynamicParticleSpeedParams: vec4<f32>,
    _DynamicParticleSize: f32,
    
    _StaticParticleSpawnRectMinMax: vec4<f32>,
    
    _ReflectionBoardRectMinMax: vec4<f32>,
    _ReflectionBoardColor: vec4<f32>,
    
    _DistanceFieldForceParams: vec4<f32>,
    _ForceByColorParams: vec4<f32>,

    _ColorByCollisionParams: vec4<f32>,
    _ColorBySpeedParams: vec4<f32>, // xy:remap range, w:enable

    _TrailFadeRate: f32,
    _SoftwareRasterizeSortingParams: vec4<f32>,

    _MousePosition: vec4<f32>, // xy: pos, z:is pressed, w: button
    _MouseInteractionParams: vec4<f32>, // x: radius, y: radial strength, z: swirl strength, w: falloff exponent
}

@group(0) @binding(0) var<uniform> _Uniforms: Uniforms;

@group(0) @binding(1) var<storage, read>       _ParticleMemoryBuffer_R: array<u32>;
@group(0) @binding(2) var<storage, read_write> _ParticleMemoryBuffer_RW: array<u32>;

@group(0) @binding(3) var<storage, read>       _ParticleActivateStateBuffer_R: array<u32>;
@group(0) @binding(4) var<storage, read_write> _ParticleActivateStateBuffer_RW: array<atomic<u32>>;

@group(0) @binding(5) var<storage, read>       _ParticleCountBuffer_R: array<u32>;
@group(0) @binding(6) var<storage, read_write> _ParticleCountBuffer_RW: array<atomic<u32>>;

@group(0) @binding(7) var<storage, read>       _ActiveDynamicParticleSlotIndexBuffer_R: array<u32>;
@group(0) @binding(8) var<storage, read_write> _ActiveDynamicParticleSlotIndexBuffer_RW: array<u32>;

@group(0) @binding(9) var<storage, read>        _ActiveStaticParticleSlotIndexBuffer_R: array<u32>;
@group(0) @binding(10) var<storage, read_write> _ActiveStaticParticleSlotIndexBuffer_RW: array<u32>;

@group(0) @binding(11) var<storage, read>       _RasterTargetBuffer_R: array<u32>;
@group(0) @binding(12) var<storage, read_write> _RasterTargetBuffer_RW: array<atomic<u32>>;

@group(0) @binding(13) var<storage, read_write> _IndirectDispatchArgsBuffer_RW: array<u32>;

@group(1) @binding(0) var _sampler_bilinear_clamp: sampler;
@group(1) @binding(1) var _DistanceFieldTexture: texture_2d<f32>;
@group(1) @binding(2) var _ParticleSpawnColorGradientTexture: texture_2d<f32>;
@group(1) @binding(3) var _ParticleColorBySpeedGradientTexture: texture_2d<f32>;

const PARTICLE_ACTIVATE_STATE_UNINITIALIZED = 0u;
const PARTICLE_ACTIVATE_STATE_STATIC = 1u;
const PARTICLE_ACTIVATE_STATE_PRE_DYNAMIC = 2u;
const PARTICLE_ACTIVATE_STATE_DYNAMIC = 3u;

fn GetTotalParticleCapacity() -> u32
{
    return _Uniforms._TotalParticleCapacity;
}

fn GetPrevDynamicParticleCount() -> u32
{
    return _ParticleCountBuffer_R[0];
}

fn GetCurrentDynamicParticleCount() -> u32
{
    return atomicLoad(&(_ParticleCountBuffer_RW[0]));
}

fn IncrementDynamicParticleCount() -> u32
{
    return atomicAdd(&(_ParticleCountBuffer_RW[0]), 1u);
}

fn GetPrevStaticParticleCount() -> u32
{
    return _ParticleCountBuffer_R[1];
}

fn GetCurrentStaticParticleCount() -> u32
{
    return atomicLoad(&(_ParticleCountBuffer_RW[1]));
}

fn IncrementStaticParticleCount() -> u32
{
    return atomicAdd(&(_ParticleCountBuffer_RW[1]), 1u);
}


fn UnpackParticleState(packedParticleState: PackedParticleState) -> ParticleState
{
    return ParticleState(
        UnpackParticlePosition(packedParticleState.packedPosition),
        UnpackParticleVelocity(packedParticleState.packedVelocity),
        UnpackColor(packedParticleState.packedColor)
    );
}

fn PackParticleState(particleState: ParticleState) -> PackedParticleState
{
    return PackedParticleState(
        PackParticlePosition(particleState.position),
        PackParticleVelocity(particleState.velocity),
        PackColor(particleState.color)
    );
}

fn ReadPrevParticleState(id: u32) -> ParticleState
{
    var packedParticleState = PackedParticleState();
    packedParticleState.packedPosition = _ParticleMemoryBuffer_R[id * PACKED_PARTICLE_STATE_SIZE];
    packedParticleState.packedVelocity = _ParticleMemoryBuffer_R[id * PACKED_PARTICLE_STATE_SIZE + 1];
    packedParticleState.packedColor    = _ParticleMemoryBuffer_R[id * PACKED_PARTICLE_STATE_SIZE + 2];
    return UnpackParticleState(packedParticleState);
}

fn WriteParticleState(id: u32, particleState: ParticleState)
{
    let packedParticleState = PackParticleState(particleState);
    _ParticleMemoryBuffer_RW[id * PACKED_PARTICLE_STATE_SIZE]     = packedParticleState.packedPosition;
    _ParticleMemoryBuffer_RW[id * PACKED_PARTICLE_STATE_SIZE + 1] = packedParticleState.packedVelocity;
    _ParticleMemoryBuffer_RW[id * PACKED_PARTICLE_STATE_SIZE + 2] = packedParticleState.packedColor;
}

fn WriteParticleActivateState(id: u32, particleActivateState: u32)
{
    atomicStore(&_ParticleActivateStateBuffer_RW[id], particleActivateState);
}

fn ReadPrevParticleActivateState(id: u32) -> u32
{
    return _ParticleActivateStateBuffer_R[id];
}

fn AtomicMarkParticlePreDynamicCandidate(id: u32) -> bool
{
    let result = atomicCompareExchangeWeak(&_ParticleActivateStateBuffer_RW[id], PARTICLE_ACTIVATE_STATE_STATIC, PARTICLE_ACTIVATE_STATE_PRE_DYNAMIC);
    return result.exchanged;
}


const THREAD_GROUP_SIZE_X = 128u;

@compute @workgroup_size(1, 1, 1)
fn InitialFillParticleCountBuffer(@builtin(global_invocation_id) globalId: vec3<u32>)
{
    if (globalId.x != 0u)
    {
        return;
    }

    atomicStore(&_ParticleCountBuffer_RW[0], 0u);
    atomicStore(&_ParticleCountBuffer_RW[1], 0u);
    atomicStore(&_ParticleCountBuffer_RW[2], 0u);

    _IndirectDispatchArgsBuffer_RW[0] = 0u;
    _IndirectDispatchArgsBuffer_RW[1] = 0u;
    _IndirectDispatchArgsBuffer_RW[2] = 0u;
    _IndirectDispatchArgsBuffer_RW[3] = 0u;
    _IndirectDispatchArgsBuffer_RW[4] = 0u;
    _IndirectDispatchArgsBuffer_RW[5] = 0u;
    _IndirectDispatchArgsBuffer_RW[6] = 0u;
    _IndirectDispatchArgsBuffer_RW[7] = 0u;
    _IndirectDispatchArgsBuffer_RW[8] = 0u;
    _IndirectDispatchArgsBuffer_RW[9] = 0u;
    _IndirectDispatchArgsBuffer_RW[10] = 0u;
    _IndirectDispatchArgsBuffer_RW[11] = 0u;
}

@compute @workgroup_size(1, 1, 1)
fn ClearParticleCounter(@builtin(global_invocation_id) globalId: vec3<u32>)
{
    if (globalId.x != 0u)
    {
        return;
    }
    
    atomicStore(&_ParticleCountBuffer_RW[0], 0u);
    atomicStore(&_ParticleCountBuffer_RW[1], 0u);
    atomicStore(&_ParticleCountBuffer_RW[2], 0u);
}

@compute @workgroup_size(1, 1, 1)
fn FillIndirectArgs(@builtin(global_invocation_id) globalId: vec3<u32>)
{
    if (globalId.x != 0u)
    {
        return;
    }

    let currentDynamicParticleCount = GetCurrentDynamicParticleCount();
    let currentStaticParticleCount = GetCurrentStaticParticleCount();

    // Dynamic Particle Update Indirect Args
    _IndirectDispatchArgsBuffer_RW[0] = (currentDynamicParticleCount + THREAD_GROUP_SIZE_X - 1u) / THREAD_GROUP_SIZE_X;
    _IndirectDispatchArgsBuffer_RW[1] = 1;
    _IndirectDispatchArgsBuffer_RW[2] = 1;
    
    // Static Particle Update Indirect Args
    _IndirectDispatchArgsBuffer_RW[3] = (currentStaticParticleCount + THREAD_GROUP_SIZE_X - 1u) / THREAD_GROUP_SIZE_X;
    _IndirectDispatchArgsBuffer_RW[4] = 1;
    _IndirectDispatchArgsBuffer_RW[5] = 1;
    
    // Rasterize Static Particles Indirect Args
    _IndirectDispatchArgsBuffer_RW[6] = (currentStaticParticleCount + THREAD_GROUP_SIZE_X - 1u) / THREAD_GROUP_SIZE_X;
    _IndirectDispatchArgsBuffer_RW[7] = 1;
    _IndirectDispatchArgsBuffer_RW[8] = 1;

    // Rasterize Dynamic Particles Indirect Args
    _IndirectDispatchArgsBuffer_RW[9] = (currentDynamicParticleCount + THREAD_GROUP_SIZE_X - 1u) / THREAD_GROUP_SIZE_X;
    _IndirectDispatchArgsBuffer_RW[10] = 1;
    _IndirectDispatchArgsBuffer_RW[11] = 1;
}


fn RandomDirection(hash: u32) -> vec2<f32>
{
    return normalize(UnpackColor(Hash(hash)).rg * 2.0 - 1.0);
}

@compute @workgroup_size(THREAD_GROUP_SIZE_X, 1, 1)
fn InitialSpawnParticles(@builtin(global_invocation_id) globalId: vec3<u32>)
{
    let particleSlotID = globalId.x;

    let staticParticleSpawnRectMinMax = _Uniforms._StaticParticleSpawnRectMinMax;
    let staticParticleSpawnWidth = u32(staticParticleSpawnRectMinMax.z - staticParticleSpawnRectMinMax.x);
    let staticParticleSpawnHeight = u32(staticParticleSpawnRectMinMax.w - staticParticleSpawnRectMinMax.y);
    let staticParticleSpawnCount = staticParticleSpawnWidth * staticParticleSpawnHeight;

    let totalSpawnCount = staticParticleSpawnCount + _Uniforms._DynamicParticleInitialCount;
    if (particleSlotID >= totalSpawnCount)
    {
        return;
    }

    let isStaticParticleSpawn = particleSlotID < staticParticleSpawnCount;

    var particleState = ParticleState(vec2<f32>(0.0, 0.0), 
                                      vec2<f32>(0.0, 0.0), 
                                      vec4<f32>(1.0, 1.0, 1.0, 1.0));
    var particleActivateState = PARTICLE_ACTIVATE_STATE_STATIC;

    var particleStableRandom = f32(Hash(particleSlotID + u32(_Uniforms._Time))) / 4294967296.0;

    // Static Particle Spawn, As Bricks
    if (isStaticParticleSpawn) 
    {
        let staticParticleSpawnID_2D = TransformID_1To2_UInt(particleSlotID, vec2<u32>(staticParticleSpawnWidth, staticParticleSpawnHeight));
        particleState.position = staticParticleSpawnRectMinMax.xy + vec2<f32>(staticParticleSpawnID_2D);
        particleState.velocity = vec2<f32>(0.0, 0.0);

        let positionUVX = (particleState.position.x - staticParticleSpawnRectMinMax.x) / f32(staticParticleSpawnWidth);
        particleStableRandom = saturate(positionUVX);
        var sampledColor = textureSampleLevel(_ParticleSpawnColorGradientTexture, 
                                              _sampler_bilinear_clamp, 
                                              vec2<f32>(particleStableRandom, 0.5), 
                                              0.0);
        var tintedColorRGB = sampledColor.rgb * _Uniforms._ParticleColorTint.rgb;
        tintedColorRGB = mix(sampledColor.rgb, 
                             tintedColorRGB, 
                             saturate(_Uniforms._ParticleColorTint.a));

        particleState.color = vec4<f32>(tintedColorRGB, particleStableRandom);        particleActivateState = PARTICLE_ACTIVATE_STATE_STATIC;
        var indexInActiveParticleSlotIndexBuffer = IncrementStaticParticleCount();
        _ActiveStaticParticleSlotIndexBuffer_RW[indexInActiveParticleSlotIndexBuffer] = particleSlotID;
        WriteParticleState(particleSlotID, particleState);
        WriteParticleActivateState(particleSlotID, particleActivateState);
    }
    // Dynamic Particle Spawn, From Reflection Board, As Bullets
    else 
    {
        let reflectionBoardRectMinMax = _Uniforms._ReflectionBoardRectMinMax;
        let reflectionBoardWidth = (reflectionBoardRectMinMax.z - reflectionBoardRectMinMax.x);
        let reflectionBoardHeight = (reflectionBoardRectMinMax.w - reflectionBoardRectMinMax.y);
        let reflectionBoardUpperCenterPoint = reflectionBoardRectMinMax.xy + 
                                                vec2<f32>(reflectionBoardWidth * 0.5, 
                                                reflectionBoardHeight);

        particleState.position = reflectionBoardUpperCenterPoint;

        var randomVel = RandomDirection(Hash(particleSlotID + u32(_Uniforms._Time)));
        randomVel.y = select(randomVel.y, -randomVel.y, randomVel.y < 0.0);

        let initialSpeed = _Uniforms._DynamicParticleSpeedParams.x;
        particleState.velocity = initialSpeed * randomVel;

        var sampledColor = textureSampleLevel(_ParticleSpawnColorGradientTexture, 
                                              _sampler_bilinear_clamp, 
                                              vec2<f32>(particleStableRandom, 0.5), 
                                              0.0);
        var tintedColorRGB = sampledColor.rgb * _Uniforms._ParticleColorTint.rgb;
        tintedColorRGB = mix(sampledColor.rgb, 
                             tintedColorRGB, 
                             saturate(_Uniforms._ParticleColorTint.a));

        particleState.color = vec4<f32>(tintedColorRGB, particleStableRandom);
        particleActivateState = PARTICLE_ACTIVATE_STATE_DYNAMIC;
        var indexInActiveParticleSlotIndexBuffer = IncrementDynamicParticleCount();
        _ActiveDynamicParticleSlotIndexBuffer_RW[indexInActiveParticleSlotIndexBuffer] = particleSlotID;
        WriteParticleState(particleSlotID, particleState);
        WriteParticleActivateState(particleSlotID, particleActivateState);
    }

}


fn GlobalSpaceToStaticParticleSpace(globalSpace: vec2<i32>) -> vec2<i32>
{
    let origin = vec2<i32>(_Uniforms._StaticParticleSpawnRectMinMax.xy);
    return globalSpace - origin;
}

fn StaticParticleSpaceToGlobalSpace(staticParticleSpace: vec2<i32>) -> vec2<i32>
{
    let origin = vec2<i32>(_Uniforms._StaticParticleSpawnRectMinMax.xy);
    return origin + vec2<i32>(staticParticleSpace);
}


fn IsReflectionBoardCollisionEnabled() -> bool
{
    return true;
}

fn IsBottomBoundaryCollisionEnabled() -> bool
{
    return true;
}

fn IsBulletOutOfBottomBound(position: vec2<f32>) -> bool
{
    if(IsBottomBoundaryCollisionEnabled())
    {    
        return false;
    }

    return position.y < -2.0;
}

fn IsPointInBounds(position: vec2<f32>, boundsMin: vec2<f32>, boundsMax: vec2<f32>) -> bool
{
    return position.x >= boundsMin.x 
            && position.x <= boundsMax.x 
            && position.y >= boundsMin.y 
            && position.y <= boundsMax.y;
}

fn IsParticleEnteredDeadZone(position: vec2<f32>) -> bool
{
    let tolerance = 20.0;
    let boundsMin = -vec2<f32>(tolerance, tolerance);
    let boundsMax = _Uniforms._RenderTargetTexelSize.zw + vec2<f32>(tolerance, tolerance);
    return !IsPointInBounds(position, boundsMin, boundsMax);
}


struct RayIntersectsAABB2DResult
{
    intersects: bool,
    tMin: f32,
    tMax: f32,
}

fn IsRayIntersectsAABB2D(rayOrigin: vec2f, rayDir: vec2f, aabbMin: vec2f, aabbMax: vec2f) -> RayIntersectsAABB2DResult 
{
    let invRayDir = 1.0 / rayDir;
    
    let tMin = (aabbMin - rayOrigin) * invRayDir;
    let tMax = (aabbMax - rayOrigin) * invRayDir;
    
    let t1 = min(tMin, tMax);
    let t2 = max(tMin, tMax);
    
    let tNear = max(t1.x, t1.y);
    let tFar = min(t2.x, t2.y);
    
    let hit = select(0.0, 1.0, tNear <= tFar && tFar >= 0.0);
    
    return RayIntersectsAABB2DResult(hit > 0.5, tNear, tFar);
}

fn ApplyReflectionBoardCollisionConstraint(prevPosition: vec2<f32>, 
        dt : f32,
        currentVelocity: ptr<function, vec2<f32>>,
        currentPosition: ptr<function, vec2<f32>>,
        currentColor: ptr<function, vec4<f32>>)
{
    if (!IsReflectionBoardCollisionEnabled())
    {   
        return;
    }

    let reflectionBoardMin = _Uniforms._ReflectionBoardRectMinMax.xy;
    let reflectionBoardMax = _Uniforms._ReflectionBoardRectMinMax.zw;

    let rayDir = normalize(*currentVelocity);
    let rayIntersectsResult = IsRayIntersectsAABB2D(prevPosition, rayDir, 
                                reflectionBoardMin, reflectionBoardMax);

    if (!rayIntersectsResult.intersects)
    {
        return;
    }

    let moveDistancePrevToCurrent = length(*currentVelocity) * dt;
    // No hit
    if(rayIntersectsResult.tMin > moveDistancePrevToCurrent)
    {
        return;
    }

    let colorTransitionFactor = _Uniforms._ColorByCollisionParams.x;
    *currentColor = mix(*currentColor, _Uniforms._ReflectionBoardColor, colorTransitionFactor);

    const kTolerance = 1.0;

    let hitPoint = prevPosition + rayDir * rayIntersectsResult.tMin;
    var hitNormal = vec2<f32>(0.0, 1.0);
    // collide withleft 
    if (abs(hitPoint.x - reflectionBoardMin.x) < kTolerance)
    {
        hitNormal = vec2<f32>(-1.0, 0.0);
    }
    // collide with right
    else if (abs(hitPoint.x - reflectionBoardMax.x) < kTolerance)
    {
        hitNormal = vec2<f32>(1.0, 0.0);
    }
    // collide with bottom
    else if (abs(hitPoint.y - reflectionBoardMin.y) < kTolerance)
    {
        hitNormal = vec2<f32>(0.0, -1.0);
    }
    // collide with top
    else if (abs(hitPoint.y - reflectionBoardMax.y) < kTolerance)
    {
        hitNormal = vec2<f32>(0.0, 1.0);
    }
    *currentVelocity = reflect(*currentVelocity, hitNormal);
    *currentPosition = hitPoint + hitNormal * kTolerance;
}


fn ApplySceneBoundsCollisionConstraint(prevPosition: vec2<f32>, 
        dt : f32,
        currentVelocity: ptr<function, vec2<f32>>,
        currentPosition: ptr<function, vec2<f32>>)
{
    let boundsMin = vec2<f32>(0.0, 0.0);
    let boundsMax = _Uniforms._RenderTargetTexelSize.zw;

    let rayDir = normalize(*currentVelocity);
    let rayIntersectsResult = IsRayIntersectsAABB2D(prevPosition, rayDir, 
                                boundsMin, boundsMax);

    if (!rayIntersectsResult.intersects)
    {
        return;
    }

    let moveDistancePrevToCurrent = length(*currentVelocity) * dt;
    // No hit
    if(rayIntersectsResult.tMax > moveDistancePrevToCurrent)
    {
        return;
    }

    const kTolerance = 1.0;

    let hitPoint = prevPosition + rayDir * rayIntersectsResult.tMax;
    var hitNormal = vec2<f32>(0.0, 1.0);
    // collide withleft 
    if (abs(hitPoint.x - boundsMin.x) < kTolerance)
    {
        hitNormal = vec2<f32>(1.0, 0.0);
    }
    // collide with right
    else if (abs(hitPoint.x - boundsMax.x) < kTolerance)
    {
        hitNormal = vec2<f32>(-1.0, 0.0);
    }
    // collide with bottom
    else if (abs(hitPoint.y - boundsMin.y) < kTolerance)
    {
        hitNormal = vec2<f32>(0.0, 1.0);
    }
    // collide with top
    else if (abs(hitPoint.y - boundsMax.y) < kTolerance)
    {
        hitNormal = vec2<f32>(0.0, -1.0);
    }
    *currentVelocity = reflect(*currentVelocity, hitNormal);
    *currentPosition = hitPoint + hitNormal * kTolerance;
}


fn IsParticleCollidingStaticParticle(position: vec2<f32>, velocity: vec2<f32>, 
                        reflectedVelocity: ptr<function, vec2<f32>>, collidedStaticParticleID: ptr<function, u32>,
                        collidedStaticParticleState: ptr<function, ParticleState>) -> bool
{
    let staticParticleSpaceID = GlobalSpaceToStaticParticleSpace(vec2<i32>(position));
    if (staticParticleSpaceID.x < 0 || staticParticleSpaceID.y < 0)
    {
        return false;
    }
    if (staticParticleSpaceID.x >= 2 * i32(_Uniforms._StaticParticleSpawnRectMinMax.z) || 
        staticParticleSpaceID.y >= 2 * i32(_Uniforms._StaticParticleSpawnRectMinMax.w))
    {
        return false;
    }
    let spawnRectMinMax = _Uniforms._StaticParticleSpawnRectMinMax;
    let spawnRectSize = vec2<i32>(i32(spawnRectMinMax.z - spawnRectMinMax.x), 
                                  i32(spawnRectMinMax.w - spawnRectMinMax.y));
    let staticParticleID1D = TransformID_2To1_Int(staticParticleSpaceID, spawnRectSize);
    if (staticParticleID1D < 0 || staticParticleID1D >= i32(_Uniforms._TotalParticleCapacity))
    {
        return false;
    }
    let staticParticleActivateState = ReadPrevParticleActivateState(u32(staticParticleID1D));
    if (staticParticleActivateState != PARTICLE_ACTIVATE_STATE_STATIC)
    {
        return false;
    }

    if (!AtomicMarkParticlePreDynamicCandidate(u32(staticParticleID1D)))
    {
        return false;
    }


    *collidedStaticParticleID = u32(staticParticleID1D);
    let staticParticleState = ReadPrevParticleState(u32(staticParticleID1D));

    *collidedStaticParticleState = staticParticleState;
    
    let randomDirection = normalize(UnpackColor(Hash(u32(staticParticleID1D) + u32(_Uniforms._Time))).rg * 2.0 - 1.0);
    var newVelocity = reflect(velocity, randomDirection);

    if(abs(newVelocity.y) > abs(newVelocity.x) && newVelocity.y > 0.0)
    {
        newVelocity = vec2<f32>(newVelocity.x, -newVelocity.y);
    }
    else if(abs(newVelocity.y) < abs(newVelocity.x))
    {
        newVelocity = vec2<f32>(-newVelocity.x, newVelocity.y);
    }
    *reflectedVelocity = newVelocity;
    return true;
}


fn ClampParticleSpeed(velocity: ptr<function, vec2<f32>>, maxSpeed: f32)
{
    let useFixedSpeed = _Uniforms._DynamicParticleSpeedParams.z > 0.5;
    let fixedSpeed = _Uniforms._DynamicParticleSpeedParams.w;
    let speed = length(*velocity);
    let direction = normalize(*velocity);
    if (useFixedSpeed)
    {
        *velocity = direction * fixedSpeed;
    }
    else
    {
        *velocity = direction * min(speed, maxSpeed);
    }
}

fn SampleDistanceFieldTexture(statePosition: vec2<f32>) -> vec4<f32>
{
    let uv = statePosition * _Uniforms._RenderTargetTexelSize.xy;
    let dfTexSample = textureSampleLevel(_DistanceFieldTexture, _sampler_bilinear_clamp, uv, 0.0);
    return dfTexSample;
}

fn SafeNormalize(v: vec2<f32>) -> vec2<f32>
{
    let sqLength = dot(v,v);
    if(sqLength < f32(1e-7))
    {
        return vec2<f32>(0,0);
    }
    return normalize(v);
}

fn rotate_90_ccw(v: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(-v.y, v.x);
}

fn rotate_90_cw(v: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(v.y, -v.x);
}

fn ApplyParticleMotion_DistanceField(state : ptr<function, ParticleState>, dt: f32, maxSpeed: ptr<function, f32>)
{
    let useDistanceField = _Uniforms._DistanceFieldForceParams.x > 0.5;
    if(!useDistanceField)
    {
        return;
    }
    let newPosition = (*state).position + (*state).velocity * dt;
    
    let dfTexSample = SampleDistanceFieldTexture(newPosition);

    var dfGradient = dfTexSample.xy * 2.0 - 1.0;
    dfGradient = SafeNormalize(dfGradient);
    let dfTangent = rotate_90_ccw(dfGradient);
    
    let sdf = dfTexSample.z * 2.0 - 1.0;
    let isInsideDf = sdf < 0.0;
    let df = abs(sdf);
    
    if (isInsideDf)
    {
        let collisionStrength = _Uniforms._DistanceFieldForceParams.y
                    * _Uniforms._RenderTargetTexelSize.zw * 0.25;
        (*state).velocity += dfGradient * collisionStrength * dt;
        
        let swirlStrength = _Uniforms._DistanceFieldForceParams.w
                            * _Uniforms._RenderTargetTexelSize.zw * 0.25;
        (*state).velocity += dfTangent * swirlStrength * dt;
        
        *maxSpeed = min(*maxSpeed * mix(1.5, 3.5, pow(df, 0.3)), 8000.0);
    }
    else
    {
        if(df < 0.001)
        {
            (*state).velocity = reflect((*state).velocity, dfGradient);
        }
        else
        {
            let swirlStrength = _Uniforms._DistanceFieldForceParams.z
                    * _Uniforms._RenderTargetTexelSize.zw * 0.25;
            (*state).velocity += dfTangent * swirlStrength * dt;
        }
    }


    let dfForColorBlend = pow(df, 0.3);
    let colorInside = mix(vec4<f32>(1.0, 1.0, 1.0, 1.0), vec4<f32>(1.0, 0.0, 0.0, 1.0), dfForColorBlend);
    let colorOutside = mix(vec4<f32>(1.0, 1.0, 1.0, 1.0), vec4<f32>(0.0, 0.0, 1.0, 1.0), dfForColorBlend);
    let colorByDf = select(colorInside, colorOutside, sdf > 0.0);
}

fn ApplyParticleMotion_ForceByColor(state : ptr<function, ParticleState>, dt: f32)
{
    let phaseOffset = state.color.g + _Uniforms._ForceByColorParams.y;
    var forceDir = normalize(vec2<f32>(state.color.r, 
                                        state.color.b) * 2.0 - 1.0);
    let rotation = mat2x2<f32>(vec2<f32>(cos(phaseOffset), -sin(phaseOffset)),
                               vec2<f32>(sin(phaseOffset), cos(phaseOffset)));
    forceDir = rotation * forceDir;
    forceDir = normalize(forceDir);
    let forceStrength = _Uniforms._ForceByColorParams.x
                      * _Uniforms._RenderTargetTexelSize.zw * 0.25;
    (*state).velocity += forceDir * forceStrength * dt;
}

fn ApplyParticleMotion_MouseInteraction(state : ptr<function, ParticleState>, dt: f32)
{
    let mousePosition = _Uniforms._MousePosition.xy;
    
    let button = i32(_Uniforms._MousePosition.w);
    let isPressed = button >= 0;
    if (!isPressed)
    {
        return;
    }

    let forceDirection = select(1.0, -1.0, button == 0);

    let mouseInteractionParams = _Uniforms._MouseInteractionParams;
    let radius = mouseInteractionParams.x;
    let radialStrength = mouseInteractionParams.y * forceDirection * select(0.0, 1.0, button != 1);
    let swirlStrength = mouseInteractionParams.z * select(0.0, 1.0, button == 1);
    let falloffExponent = mouseInteractionParams.w;

    let distance = length(state.position - mousePosition);
    if (distance > radius)
    {
        return;
    }
    var distanceRemap = distance / radius;
    distanceRemap = saturate(distanceRemap);
    let distanceRemapPow = pow(distanceRemap, falloffExponent);
    let radialForceStrength = distanceRemapPow * radialStrength
                            * _Uniforms._RenderTargetTexelSize.zw * 0.25;
    let swirlForceStrength = swirlStrength
                            * _Uniforms._RenderTargetTexelSize.zw * 0.25;

    let radialForceDir = normalize(mousePosition - state.position);
    let swirlForceDir = rotate_90_ccw(radialForceDir);
    (*state).velocity += radialForceDir * radialForceStrength * dt;
    (*state).velocity += swirlForceDir * swirlForceStrength * dt;

}


@compute @workgroup_size(THREAD_GROUP_SIZE_X, 1, 1)
fn UpdateDynamicParticles(@builtin(global_invocation_id) globalId: vec3<u32>)
{
    if (globalId.x >= GetPrevDynamicParticleCount())
    {
        return;
    }

    let particleSlotID = _ActiveDynamicParticleSlotIndexBuffer_R[globalId.x];
    var particleState = ReadPrevParticleState(particleSlotID);
    let particleActivateState = ReadPrevParticleActivateState(particleSlotID);
    let deltaTime = min(0.05, _Uniforms._DeltaTime);

    var maxSpeed = _Uniforms._DynamicParticleSpeedParams.y;
    ApplyParticleMotion_DistanceField(&particleState, deltaTime, &maxSpeed);
    ApplyParticleMotion_ForceByColor(&particleState, deltaTime);
    ApplyParticleMotion_MouseInteraction(&particleState, deltaTime);
    var newVelocity = particleState.velocity;
    ClampParticleSpeed(&newVelocity, maxSpeed);

    var newPosition = particleState.position + newVelocity * deltaTime;
    var newColor = particleState.color;

    ApplyReflectionBoardCollisionConstraint(particleState.position, deltaTime, &newVelocity, &newPosition, &newColor);
    ApplySceneBoundsCollisionConstraint(particleState.position, deltaTime, &newVelocity, &newPosition);

    var velocityAfterCollision = newVelocity;
    var collidedStaticParticleID = 0u;
    var collidedStaticParticleState = ParticleState();
    if (IsParticleCollidingStaticParticle(newPosition, newVelocity, &velocityAfterCollision, &collidedStaticParticleID, &collidedStaticParticleState))
    {
        newVelocity = velocityAfterCollision;
        let colorTransitionFactor = _Uniforms._ColorByCollisionParams.y;
        newColor = mix(newColor, collidedStaticParticleState.color, colorTransitionFactor);
    }

    particleState.velocity = newVelocity;
    particleState.position = newPosition;
    particleState.color = newColor;

    WriteParticleState(particleSlotID, particleState);
    WriteParticleActivateState(particleSlotID, particleActivateState);

    var indexInActiveParticleSlotIndexBuffer = IncrementDynamicParticleCount();
    _ActiveDynamicParticleSlotIndexBuffer_RW[indexInActiveParticleSlotIndexBuffer] = particleSlotID;
}


@compute @workgroup_size(THREAD_GROUP_SIZE_X, 1, 1)
fn UpdateStaticParticles_ConvertPreDynamic(@builtin(global_invocation_id) globalId: vec3<u32>)
{
    if (globalId.x >= GetPrevStaticParticleCount())
    {
        return;
    }

    let particleSlotID = _ActiveStaticParticleSlotIndexBuffer_R[globalId.x];
    var particleState = ReadPrevParticleState(particleSlotID);
    var particleActivateState = ReadPrevParticleActivateState(particleSlotID);
    let deltaTime = min(0.05, _Uniforms._DeltaTime);

    if (particleActivateState != PARTICLE_ACTIVATE_STATE_PRE_DYNAMIC)
    {
        return;
    }
    
    particleActivateState = PARTICLE_ACTIVATE_STATE_DYNAMIC;
    // Initialize Velocity Here
    var randomVel = RandomDirection(particleSlotID);
    let initialSpeed = _Uniforms._DynamicParticleSpeedParams.x;
    particleState.velocity = initialSpeed * randomVel;
    particleState.position += particleState.velocity * deltaTime;

    var indexInActiveParticleSlotIndexBuffer = IncrementDynamicParticleCount();
    _ActiveDynamicParticleSlotIndexBuffer_RW[indexInActiveParticleSlotIndexBuffer] = particleSlotID;
    WriteParticleState(particleSlotID, particleState);
    WriteParticleActivateState(particleSlotID, particleActivateState);
}


@compute @workgroup_size(THREAD_GROUP_SIZE_X, 1, 1)
fn UpdateStaticParticles_CollectStatic(@builtin(global_invocation_id) globalId: vec3<u32>)
{
    if (globalId.x >= GetPrevStaticParticleCount())
    {
        return;
    }

    let particleSlotID = _ActiveStaticParticleSlotIndexBuffer_R[globalId.x];
    var particleState = ReadPrevParticleState(particleSlotID);
    var particleActivateState = ReadPrevParticleActivateState(particleSlotID);

    if (particleActivateState != PARTICLE_ACTIVATE_STATE_STATIC)
    {
        return;
    }
    
    var indexInActiveParticleSlotIndexBuffer = IncrementStaticParticleCount();
    _ActiveStaticParticleSlotIndexBuffer_RW[indexInActiveParticleSlotIndexBuffer] = particleSlotID;
    WriteParticleState(particleSlotID, particleState);
    WriteParticleActivateState(particleSlotID, particleActivateState);
}


@compute @workgroup_size(8, 8, 1)
fn FadeSoftwareRasterizeTarget(@builtin(global_invocation_id) globalId: vec3<u32>)
{
    let texelSize = _Uniforms._RenderTargetTexelSize;
    let textureSize = vec2<u32>( u32(texelSize.z), u32(texelSize.w));

    let pixelIndex = globalId.xy;
    if (pixelIndex.x >= textureSize.x || pixelIndex.y >= textureSize.y)
    {
        return;
    }    

    let id1d = TransformID_2To1_UInt(pixelIndex, textureSize);
    var packedColor = _RasterTargetBuffer_R[id1d];
    var color = UnpackColor(packedColor);
    color *= saturate(1.0 - saturate(_Uniforms._TrailFadeRate));
    color = saturate(color);

    packedColor = PackColor(color);

    atomicStore(&_RasterTargetBuffer_RW[id1d], packedColor);
}



@compute @workgroup_size(THREAD_GROUP_SIZE_X, 1, 1)
fn SoftwareRasterizeStaticParticles(@builtin(global_invocation_id) globalId: vec3<u32>)
{
    if (globalId.x >= GetCurrentStaticParticleCount())
    {
        return;
    }

    let texelSize = _Uniforms._RenderTargetTexelSize;
    let textureSize = vec2<u32>( u32(texelSize.z), u32(texelSize.w));

    let particleSlotID = _ActiveStaticParticleSlotIndexBuffer_R[globalId.x];
    let particleState = ReadPrevParticleState(particleSlotID);

    var pixelIndex = vec2<u32>(u32(particleState.position.x), u32(particleState.position.y));
    if (pixelIndex.x >= textureSize.x || pixelIndex.y >= textureSize.y)
    {
        return;
    }

    let id1d = TransformID_2To1_UInt(pixelIndex, textureSize);
    let packedColor = PackColor(particleState.color);
    atomicStore(&_RasterTargetBuffer_RW[id1d], packedColor);
}



fn RasterizeDynamicParticle(uv: vec2<f32>, particleState: ParticleState) -> vec4<f32>
{
    return particleState.color;
}


@compute @workgroup_size(THREAD_GROUP_SIZE_X, 1, 1)
fn SoftwareRasterizeDynamicParticles(@builtin(global_invocation_id) globalId: vec3<u32>)
{
    if (globalId.x >= GetCurrentDynamicParticleCount())
    {
        return;
    }

    let texelSize = _Uniforms._RenderTargetTexelSize;
    let textureSize = vec2<u32>( u32(texelSize.z), u32(texelSize.w));

    let particleSlotID = _ActiveDynamicParticleSlotIndexBuffer_R[globalId.x];
    let particleState = ReadPrevParticleState(particleSlotID);

    let pixelIndex = vec2<u32>(u32(particleState.position.x), u32(particleState.position.y));
    if (pixelIndex.x >= textureSize.x || pixelIndex.y >= textureSize.y)
    {
        return;
    }


    var color = particleState.color;
    let velocity = particleState.velocity;
    let speed = length(velocity);
    var speedRemap = (speed - _Uniforms._ColorBySpeedParams.x) 
                    / max(1e-7, _Uniforms._ColorBySpeedParams.y - _Uniforms._ColorBySpeedParams.x);
    speedRemap = saturate(speedRemap);
    let sampledColorBySpeed = textureSampleLevel(_ParticleColorBySpeedGradientTexture, _sampler_bilinear_clamp, vec2<f32>(speedRemap, 0.5), 0.0);
    color = mix(color, sampledColorBySpeed, _Uniforms._ColorBySpeedParams.w);

    let sortingPeakCount = _Uniforms._SoftwareRasterizeSortingParams.x;
    let sortingChangeSpeed = _Uniforms._SoftwareRasterizeSortingParams.y;
    let particleBlendMode = u32(_Uniforms._SoftwareRasterizeSortingParams.z);

    // color.a as sorting index
    var sortingIndex = particleState.color.a;
    if (_Uniforms._ColorBySpeedParams.w > 0.0001)
    {
        sortingIndex = speedRemap;
    }
    else
    {
        sortingIndex = cos(sortingPeakCount * 3.14 * sortingIndex + _Uniforms._Time * sortingChangeSpeed);
        sortingIndex = saturate(sortingIndex * 0.5 + 0.5);
    }

    color.a = sortingIndex;
    let packedColor = PackColor(color);
    let particleRenderSize = i32(_Uniforms._DynamicParticleSize);

    for (var x = 0; x < particleRenderSize; x++)
    {
        for (var y = 0; y < particleRenderSize; y++)
        {
            let texel = vec2<i32>(i32(pixelIndex.x), i32(pixelIndex.y)) 
                + vec2<i32>(x - particleRenderSize / 2, y - particleRenderSize / 2);
            
            let texel1D = TransformID_2To1_Int(texel, vec2<i32>(i32(textureSize.x), i32(textureSize.y)));
            if (texel1D < 0 || texel1D > i32(textureSize.x * textureSize.y))
            {
               continue;
            }
            
            // var uv = vec2<f32>(f32(x), f32(y)) / f32(particleRenderSize);
            // uv = uv * 2.0 - 1.0;

            if (particleBlendMode == 0) // Stable Sorting
            {    
                atomicMax(&_RasterTargetBuffer_RW[u32(texel1D)], packedColor);
            }
            else if (particleBlendMode == 1) // Random
            {
                atomicStore(&_RasterTargetBuffer_RW[u32(texel1D)], packedColor);
            }
            else if (particleBlendMode == 2) // Additive
            {
                atomicOr(&_RasterTargetBuffer_RW[u32(texel1D)], packedColor);
            }
        }
    }
}
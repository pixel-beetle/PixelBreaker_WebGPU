
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
    packedPosition: vec2<f32>,
    packedVelocity: vec2<f32>,
    packedColor: u32
}

struct ParticleState
{
    position: vec2<f32>,
    velocity: vec2<f32>,
    color: vec4<f32>
}


const PACKED_PARTICLE_STATE_SIZE = 5;


struct Uniforms
{
    _Time: f32,
    _DeltaTime: f32,
    _RenderTargetTexelSize: vec4<f32>,
    _TotalParticleCapacity: u32,
    _DynamicParticleInitialCount: u32,
    _DynamicParticleMaxSpeed: f32,
    _DynamicParticleSize: f32,
    _StaticParticleSpawnRectMinMax: vec4<f32>,
    _ReflectionBoardRectMinMax: vec4<f32>,
    _ReflectionBoardColor: vec4<f32>
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
        packedParticleState.packedPosition,
        packedParticleState.packedVelocity,
        UnpackColor(packedParticleState.packedColor)
    );
}

fn PackParticleState(particleState: ParticleState) -> PackedParticleState
{
    return PackedParticleState(
        particleState.position,
        particleState.velocity,
        PackColor(particleState.color)
    );
}

fn ReadPrevParticleState(id: u32) -> ParticleState
{
    var packedParticleState = PackedParticleState();
    packedParticleState.packedPosition.x = bitcast<f32>(_ParticleMemoryBuffer_R[id * PACKED_PARTICLE_STATE_SIZE]);
    packedParticleState.packedPosition.y = bitcast<f32>(_ParticleMemoryBuffer_R[id * PACKED_PARTICLE_STATE_SIZE + 1]);
    packedParticleState.packedVelocity.x = bitcast<f32>(_ParticleMemoryBuffer_R[id * PACKED_PARTICLE_STATE_SIZE + 2]);
    packedParticleState.packedVelocity.y = bitcast<f32>(_ParticleMemoryBuffer_R[id * PACKED_PARTICLE_STATE_SIZE + 3]);
    packedParticleState.packedColor =                   _ParticleMemoryBuffer_R[id * PACKED_PARTICLE_STATE_SIZE + 4];
    return UnpackParticleState(packedParticleState);
}

fn WriteParticleState(id: u32, particleState: ParticleState)
{
    let packedParticleState = PackParticleState(particleState);
    _ParticleMemoryBuffer_RW[id * PACKED_PARTICLE_STATE_SIZE]     = bitcast<u32>(packedParticleState.packedPosition.x);
    _ParticleMemoryBuffer_RW[id * PACKED_PARTICLE_STATE_SIZE + 1] = bitcast<u32>(packedParticleState.packedPosition.y);
    _ParticleMemoryBuffer_RW[id * PACKED_PARTICLE_STATE_SIZE + 2] = bitcast<u32>(packedParticleState.packedVelocity.x);
    _ParticleMemoryBuffer_RW[id * PACKED_PARTICLE_STATE_SIZE + 3] = bitcast<u32>(packedParticleState.packedVelocity.y);
    _ParticleMemoryBuffer_RW[id * PACKED_PARTICLE_STATE_SIZE + 4] = packedParticleState.packedColor;
}

fn WriteParticleActivateState(id: u32, particleActivateState: u32)
{
    atomicStore(&_ParticleActivateStateBuffer_RW[id], particleActivateState);
}

fn ReadPrevParticleActivateState(id: u32) -> u32
{
    return _ParticleActivateStateBuffer_R[id];
}

fn AtomicMarkParticlePreDynamicCandidate(id: u32)
{
    atomicCompareExchangeWeak(&_ParticleActivateStateBuffer_RW[id], PARTICLE_ACTIVATE_STATE_STATIC, PARTICLE_ACTIVATE_STATE_PRE_DYNAMIC);
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

    // Static Particle Spawn, As Bricks
    if (isStaticParticleSpawn) 
    {
        let staticParticleSpawnID_2D = TransformID_1To2_UInt(particleSlotID, vec2<u32>(staticParticleSpawnWidth, staticParticleSpawnHeight));
        particleState.position = staticParticleSpawnRectMinMax.xy + vec2<f32>(staticParticleSpawnID_2D);
        particleState.velocity = vec2<f32>(0.0, 0.0);
        var randomColor = UnpackColor(Hash(particleSlotID));
        particleState.color = randomColor;
        particleActivateState = PARTICLE_ACTIVATE_STATE_STATIC;
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
                                                reflectionBoardHeight * 0.5);

        particleState.position = reflectionBoardUpperCenterPoint;

        var randomVel = normalize(UnpackColor(Hash(particleSlotID)).rg * 2.0 - 1.0);
        randomVel.y = select(randomVel.y, -randomVel.y, randomVel.y < 0.0);

        particleState.velocity = _Uniforms._DynamicParticleMaxSpeed * randomVel;

        particleState.color = _Uniforms._ReflectionBoardColor;
        particleActivateState = PARTICLE_ACTIVATE_STATE_DYNAMIC;
        var indexInActiveParticleSlotIndexBuffer = IncrementDynamicParticleCount();
        _ActiveDynamicParticleSlotIndexBuffer_RW[indexInActiveParticleSlotIndexBuffer] = particleSlotID;
        WriteParticleState(particleSlotID, particleState);
        WriteParticleActivateState(particleSlotID, particleActivateState);
    }

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

fn IsBulletEnteredDeadZone(position: vec2<f32>) -> bool
{
    let tolerance = 20.0;
    let boundsMin = -vec2<f32>(tolerance, tolerance);
    let boundsMax = _Uniforms._RenderTargetTexelSize.zw + vec2<f32>(tolerance, tolerance);
    return !IsPointInBounds(position, boundsMin, boundsMax);
}

fn IsBulletCollidingBounds(position: vec2<f32>, velocity: vec2<f32>, 
 reflectedVelocity: ptr<function, vec2<f32>>, correctedPosition: ptr<function, vec2<f32>>) -> bool
{
    let tolerance = 15.0;
    if (abs(position.y - _Uniforms._RenderTargetTexelSize.w) <= tolerance)
    {
        *reflectedVelocity = reflect(velocity, vec2<f32>(0, -1));
        *correctedPosition = vec2<f32>(position.x, _Uniforms._RenderTargetTexelSize.w - tolerance);
        return true;
    }
    if ( IsBottomBoundaryCollisionEnabled() && abs(position.y) <= tolerance)
    {
        *reflectedVelocity = reflect(velocity, vec2<f32>(0, 1));
        *correctedPosition = vec2<f32>(position.x, tolerance);
        return true;
    }
    if (abs(position.x) <= tolerance)
    {
        *reflectedVelocity = reflect(velocity, vec2<f32>(-1, 0));
        *correctedPosition = vec2<f32>(tolerance, position.y);
        return true;
    }
    if (abs(position.x - _Uniforms._RenderTargetTexelSize.z) <= tolerance)
    {
        *reflectedVelocity = reflect(velocity, vec2<f32>(1, 0));
        *correctedPosition = vec2<f32>(_Uniforms._RenderTargetTexelSize.z - tolerance, position.y);
        return true;
    }
    return false;
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
    let deltaTime = _Uniforms._DeltaTime;

    particleState.position += particleState.velocity * deltaTime;

    var correctedPosition = vec2<f32>(0.0, 0.0);
    var reflectedVelocity = vec2<f32>(0.0, 0.0);
    if (IsBulletCollidingBounds(particleState.position, particleState.velocity, &reflectedVelocity, &correctedPosition))
    {
        particleState.position = correctedPosition;
        particleState.velocity = reflectedVelocity;
    }


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
    let deltaTime = _Uniforms._DeltaTime;

    if (particleActivateState != PARTICLE_ACTIVATE_STATE_PRE_DYNAMIC)
    {
        return;
    }
    
    particleActivateState = PARTICLE_ACTIVATE_STATE_DYNAMIC;
    // Initialize Velocity Here
    particleState.velocity = vec2<f32>(0.0, 1.0);
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
    color *= 0.95;
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
    atomicMax(&_RasterTargetBuffer_RW[id1d], packedColor);
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
            
            var uv = vec2<f32>(f32(x), f32(y)) / f32(particleRenderSize);
            uv = uv * 2.0 - 1.0;

            let color = RasterizeDynamicParticle(uv, particleState);
            let packedColor = PackColor(color);

            atomicMax(&_RasterTargetBuffer_RW[u32(texel1D)], packedColor);
        }
    }
}
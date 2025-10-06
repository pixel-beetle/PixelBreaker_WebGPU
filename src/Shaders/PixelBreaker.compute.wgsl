



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
    return (u32(color.a * 255.0) << 24)
            | (u32(color.b * 255.0) << 16)
            | (u32(color.g * 255.0) << 8)
            | (u32(color.r * 255.0));
}

fn UnpackColor(color: u32) -> vec4<f32>
{
    return vec4<f32>(
        f32((color & 0x000000FF) >> 0) / 255.0,
        f32((color & 0x0000FF00) >> 8) / 255.0,
        f32((color & 0x00FF0000) >> 16) / 255.0,
        f32((color & 0xFF000000) >> 24) / 255.0
    );
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

@group(0) @binding(1) var<storage, read> _ParticleMemoryBuffer_R: array<u32>;
@group(0) @binding(2) var<storage, read_write> _ParticleMemoryBuffer_RW: array<u32>;

@group(0) @binding(3) var<storage, read_write> _ParticleActivateStateBuffer_R: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> _ParticleActivateStateBuffer_RW: array<atomic<u32>>;

@group(0) @binding(5) var<storage, read_write> _ParticleCountBuffer_R: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read_write> _ParticleCountBuffer_RW: array<atomic<u32>>;

@group(0) @binding(7) var<storage, read_write> _ParticleConvertCandidateBuffer_RW: array<u32>;

@group(0) @binding(8) var<storage, read_write> _RasterTargetBuffer_R: array<atomic<u32>>;
@group(0) @binding(9) var<storage, read_write> _RasterTargetBuffer_RW: array<atomic<u32>>;

@group(0) @binding(10) var<storage, read_write> _IndirectDispatchArgsBuffer_UpdateDynamicParticles_RW: array<u32>;
@group(0) @binding(11) var<storage, read_write> _IndirectDispatchArgsBuffer_ConvertStaticParticles_RW: array<u32>;
@group(0) @binding(12) var<storage, read_write> _IndirectDispatchArgsBuffer_RasterizeParticles_RW: array<u32>;


const PARTICLE_ACTIVATE_STATE_STATIC = 0u;
const PARTICLE_ACTIVATE_STATE_PRE_DYNAMIC = 1u;
const PARTICLE_ACTIVATE_STATE_DYNAMIC = 2u;

fn GetTotalParticleCapacity() -> u32
{
    return _Uniforms._TotalParticleCapacity;
}

fn GetPrevDynamicParticleCount() -> u32
{
    return atomicLoad(&_ParticleCountBuffer_R[0]);
}

fn GetCurrentDynamicParticleCount() -> u32
{
    return atomicLoad(&_ParticleCountBuffer_RW[0]);
}

fn IncrementDynamicParticleCount()
{
    atomicAdd(&_ParticleCountBuffer_RW[0], 1u);
}

fn GetPrevStaticParticleCount() -> u32
{
    return atomicLoad(&_ParticleCountBuffer_R[1]);
}

fn GetCurrentStaticParticleCount() -> u32
{
    return atomicLoad(&_ParticleCountBuffer_RW[1]);
}

fn IncrementStaticParticleCount()
{
    atomicAdd(&_ParticleCountBuffer_RW[1], 1u);
}

fn GetPrevConvertCandidateParticleCount() -> u32
{
    return atomicLoad(&_ParticleCountBuffer_R[2]);
}

fn GetCurrentConvertCandidateParticleCount() -> u32
{
    return atomicLoad(&_ParticleCountBuffer_RW[2]);
}

fn IncrementConvertCandidateParticleCount()
{
    atomicAdd(&_ParticleCountBuffer_RW[2], 1u);
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
    packedParticleState.packedColor = _ParticleMemoryBuffer_R[id * PACKED_PARTICLE_STATE_SIZE + 2];
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
    return atomicLoad(&_ParticleActivateStateBuffer_R[id]);
}

fn AtomicMarkParticlePreDynamicCandidate(id: u32)
{
    let compareExchangeResult = atomicCompareExchangeWeak(&_ParticleActivateStateBuffer_RW[id], PARTICLE_ACTIVATE_STATE_STATIC, PARTICLE_ACTIVATE_STATE_PRE_DYNAMIC);
    if (compareExchangeResult.exchanged)
    {
        let candidateIndex = atomicAdd(&_ParticleCountBuffer_RW[1], 1u);
        if (candidateIndex >= _Uniforms._TotalParticleCapacity)
        {
            return;
        }
        _ParticleConvertCandidateBuffer_RW[candidateIndex] = id;
    }
}

fn MarkParticleStatic(id: u32)
{
    atomicStore(&_ParticleActivateStateBuffer_RW[id], PARTICLE_ACTIVATE_STATE_STATIC);
}

fn MarkParticleDynamic(id: u32)
{
    atomicStore(&_ParticleActivateStateBuffer_RW[id], PARTICLE_ACTIVATE_STATE_DYNAMIC);
}


const THREAD_GROUP_SIZE_X = 128u;

@compute @workgroup_size(1, 1, 1)
fn InitialFillParticleCountBuffer(@builtin(global_invocation_id) globalId: vec3<u32>)
{
    if (globalId.x != 0u)
    {
        return;
    }

    let staticParticleSpawnRectMinMax = _Uniforms._StaticParticleSpawnRectMinMax;
    let staticParticleSpawnWidth = u32(staticParticleSpawnRectMinMax.z - staticParticleSpawnRectMinMax.x);
    let staticParticleSpawnHeight = u32(staticParticleSpawnRectMinMax.w - staticParticleSpawnRectMinMax.y);
    let staticParticleSpawnCount = staticParticleSpawnWidth * staticParticleSpawnHeight;

    atomicStore(&_ParticleCountBuffer_RW[0], _Uniforms._DynamicParticleInitialCount);
    atomicStore(&_ParticleCountBuffer_RW[1], staticParticleSpawnCount);
    atomicStore(&_ParticleCountBuffer_RW[2], 0u);
}


@compute @workgroup_size(THREAD_GROUP_SIZE_X, 1, 1)
fn InitialSpawnParticles(@builtin(global_invocation_id) globalId: vec3<u32>)
{
    let particleID = globalId.x;

    let staticParticleSpawnRectMinMax = _Uniforms._StaticParticleSpawnRectMinMax;
    let staticParticleSpawnWidth = u32(staticParticleSpawnRectMinMax.z - staticParticleSpawnRectMinMax.x);
    let staticParticleSpawnHeight = u32(staticParticleSpawnRectMinMax.w - staticParticleSpawnRectMinMax.y);
    let staticParticleSpawnCount = staticParticleSpawnWidth * staticParticleSpawnHeight;

    let totalSpawnCount = staticParticleSpawnCount + _Uniforms._DynamicParticleInitialCount;
    if (particleID >= totalSpawnCount)
    {
        return;
    }

    let isStaticParticleSpawn = globalId.x < staticParticleSpawnCount;

    var particleState = ParticleState(vec2<f32>(0.0, 0.0), 
                                      vec2<f32>(0.0, 0.0), 
                                      vec4<f32>(1.0, 1.0, 1.0, 1.0));
    var particleActivateState = PARTICLE_ACTIVATE_STATE_STATIC;

    // Static Particle Spawn, As Bricks
    if (isStaticParticleSpawn) 
    {
        let staticParticleSpawnID_2D = TransformID_1To2_UInt(particleID, vec2<u32>(staticParticleSpawnWidth, staticParticleSpawnHeight));
        particleState.position = staticParticleSpawnRectMinMax.xy + vec2<f32>(staticParticleSpawnID_2D);
        particleState.velocity = vec2<f32>(0.0, 0.0);
        particleState.color = vec4<f32>(1.0, 1.0, 1.0, 1.0);
        particleActivateState = PARTICLE_ACTIVATE_STATE_STATIC;
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
        particleState.velocity = vec2<f32>(0.0, 0.0);
        particleState.color = _Uniforms._ReflectionBoardColor;
        particleActivateState = PARTICLE_ACTIVATE_STATE_DYNAMIC;
    }

    WriteParticleState(particleID, particleState);
    WriteParticleActivateState(particleID, particleActivateState);
}




fn TransformID_2To1(id: vec2<u32>, size: vec2<u32>) -> u32 
{
    return id.x + id.y * size.x;
}

fn TransformID_2To1(id: vec2<i32>, size: vec2<i32>) -> i32 
{
    return id.x + id.y * size.x;
}

fn TransformID_1To2(id: u32, size: vec2<u32>) -> vec2<u32>
{
    return vec2<u32>(id % size.x, id / size.x);
}

fn TransformID_1To2(id: i32, size: vec2<i32>) -> vec2<i32>
{
    return vec2<i32>(id % size.x, id / size.x);
}

fn TransformID_1ToUV(id: u32, size: vec2<u32>) -> vec2<f32>
{
    return vec2<f32>(TransformID_1To2(id, size)) / vec2<f32>(size.x, size.y);
}

fn PackColor(color: vec4<f32>) -> u32
{
    return u32(color.a * 255.0) << 24 
            | u32(color.b * 255.0) << 16 
            | u32(color.g * 255.0) << 8 
            | u32(color.r * 255.0);
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
    _DispatchedThreadCount: u32;
    _RenderTargetTexelSize: vec4<f32>;
    _TotalParticleCapacity: u32;
    _DynamicParticleInitialCount: u32;
    _DynamicParticleMaxSpeed: f32;
    _DynamicParticleSize: f32;
    _StaticParticleSpawnRectMinMax: vec4<f32>;
    _ReflectionBoardRectMinMax: vec4<f32>;
    _ReflectionBoardColor: vec4<f32>;
}

@group(0) @binding(0) var<uniform> _Uniforms: Uniforms;

@group(0) @binding(1) var<storage, read> _ParticleMemoryBuffer_R: array<u32>;
@group(0) @binding(2) var<storage, read_write> _ParticleMemoryBuffer_RW: array<u32>;

@group(0) @binding(3) var<storage, read> _ParticleActivateStateBuffer_R: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> _ParticleActivateStateBuffer_RW: array<atomic<u32>>;

@group(0) @binding(5) var<storage, read> _ParticleCountBuffer_R: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read_write> _ParticleCountBuffer_RW: array<atomic<u32>>;

@group(0) @binding(7) var<storage, read_write> _ParticleConvertCandidateBuffer_RW: array<u32>;

@group(0) @binding(8) var<storage, read> _RasterTargetBuffer_R: array<atomic<u32>>;
@group(0) @binding(9) var<storage, read_write> _RasterTargetBuffer_RW: array<atomic<u32>>;



const PARTICLE_ACTIVATE_STATE_STATIC = 0u;
const PARTICLE_ACTIVATE_STATE_PRE_DYNAMIC = 1u;
const PARTICLE_ACTIVATE_STATE_DYNAMIC = 2u;

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
    return _ParticleCountBuffer_RW[0];
}

fn GetPrevConvertCandidateParticleCount() -> u32
{
    return _ParticleCountBuffer_R[1];
}

fn GetCurrentConvertCandidateParticleCount() -> u32
{
    return _ParticleCountBuffer_RW[1];
}

fn UnpackParticleState(packedParticleState: PackedParticleState) -> ParticleState
{
    return ParticleState(
        position: packedParticleState.packedPosition,
        velocity: packedParticleState.packedVelocity,
        color: UnpackColor(packedParticleState.packedColor)
    );
}

fn PackParticleState(particleState: ParticleState) -> PackedParticleState
{
    return PackedParticleState(
        packedPosition: particleState.position,
        packedVelocity: particleState.velocity,
        packedColor: PackColor(particleState.color)
    );
}

fn ReadPrevParticleState(id: u32) -> ParticleState
{
    let packedParticleState = _ParticleMemoryBuffer_R[id];
    return UnpackParticleState(packedParticleState);
}

fn WriteParticleState(id: u32, particleState: ParticleState) -> void
{
    let packedParticleState = PackParticleState(particleState);
    _ParticleMemoryBuffer_RW[id] = packedParticleState;
}

fn ReadPrevParticleActivateState(id: u32) -> u32
{
    return _ParticleActivateStateBuffer_R[id];
}

fn AtomicMarkParticlePreDynamicCandidate(id: u32) -> void
{
    let compareExchangeResult = atomicCompareExchange(&_ParticleActivateStateBuffer_RW[id], PARTICLE_ACTIVATE_STATE_STATIC, PARTICLE_ACTIVATE_STATE_PRE_DYNAMIC);
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

fn MarkParticleStatic(id: u32) -> void
{
    _ParticleActivateStateBuffer_RW[id] = PARTICLE_ACTIVATE_STATE_STATIC;
}

fn MarkParticleDynamic(id: u32) -> void
{
    _ParticleActivateStateBuffer_RW[id] = PARTICLE_ACTIVATE_STATE_DYNAMIC;
}



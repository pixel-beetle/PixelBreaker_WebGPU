// Jump Flooding Algorithm (JFA) for 2D Signed Distance Field Generation
// Converted from HLSL to WGSL

const THREAD_GROUP_SIZE_X = 8u;
const THREAD_GROUP_SIZE_Y = 8u;
const THREAD_GROUP_SIZE_Z = 1u;

// Input value mode constants
const _JFA_InputValueMode_RChannel = 0u;
const _JFA_InputValueMode_GChannel = 1u;
const _JFA_InputValueMode_BChannel = 2u;
const _JFA_InputValueMode_AChannel = 3u;
const _JFA_InputValueMode_Luminance = 4u;

// Uniform buffer for JFA parameters
struct JFAUniforms {
    _JFA_TexelSize: vec4<f32>,        // xy: 1.0f / size, zw: size
    _JFA_JumpDistance: vec2<i32>,     // Jump distance for iteration
    _JFA_InputValueMode: u32,         // Which channel to use for input
    _JFA_InputValueThreshold: f32,    // Threshold for inside/outside determination
    _JFA_InputInvert: f32,            // Whether to invert the input
    _JFA_InteractSphere: vec4<f32>,   // Interaction sphere parameters
}

@group(0) @binding(0) var<uniform> _JFA_Uniforms: JFAUniforms;
@group(0) @binding(1) var _JFA_InputTexture: texture_2d<f32>;
@group(0) @binding(2) var _JFA_TempBufferIn: texture_2d<f32>;
@group(0) @binding(3) var _JFA_TempBufferOut: texture_storage_2d<rgba16float, write>;

fn Luminance(sample: vec4<f32>) -> f32
{
    return dot(sample.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
}

// Helper function to get input value based on mode
fn GetInputValue(sample: vec4<f32>, mode: u32) -> f32 
{
    switch (mode) 
    {
        case _JFA_InputValueMode_RChannel: 
        {
            return sample.r;
        }
        case _JFA_InputValueMode_GChannel: 
        {
            return sample.g;
        }
        case _JFA_InputValueMode_BChannel: 
        {
            return sample.b;
        }
        case _JFA_InputValueMode_AChannel: 
        {
            return sample.a;
        }
        case _JFA_InputValueMode_Luminance: 
        {
            return Luminance(sample);
        }
        default: 
        {
            return sample.r;
        }
    }
}

// Helper function to bound index within texture bounds
fn BoundIndex(id: vec2<i32>, texelSize: vec2<f32>) -> vec2<i32> 
{
    return clamp(id, vec2<i32>(0), vec2<i32>(texelSize - 1.0));
}

// Helper function to read from temp buffer with bounds checking
fn ReadInputBuffer(id: vec2<i32>, texelSize: vec2<f32>) -> vec4<f32> 
{
    let boundedId = BoundIndex(id, texelSize);
    return textureLoad(_JFA_TempBufferIn, vec2u(boundedId), 0);
}

fn LoadJFAInputValue(id: vec2<i32>, texelSize: vec2<f32>) -> i32 
{
    let boundedId = BoundIndex(id, texelSize);
    let inputTextureSample = textureLoad(_JFA_InputTexture, vec2u(boundedId), 0);
    let inputValue = GetInputValue(inputTextureSample, _JFA_Uniforms._JFA_InputValueMode);
    let clampedInputValue = saturate(inputValue);
    var isInside = clampedInputValue < _JFA_Uniforms._JFA_InputValueThreshold;
    if (_JFA_Uniforms._JFA_InputInvert > 0.5) 
    {
        isInside = !isInside;
    }
    return select(0, 1, isInside);
}

fn ThreadIDToNormalizedPos(id: vec2<u32>) -> vec2<f32> 
{
    let texelSize = _JFA_Uniforms._JFA_TexelSize;
    return vec2<f32>(id.xy) * texelSize.xy + texelSize.xy * 0.5;
}

// JFA Initialize kernel
@compute @workgroup_size(THREAD_GROUP_SIZE_X, THREAD_GROUP_SIZE_Y, THREAD_GROUP_SIZE_Z)
fn JFA_Initialize(@builtin(global_invocation_id) globalId: vec3<u32>) 
{
    let texelSize = _JFA_Uniforms._JFA_TexelSize.zw;
    if (globalId.x >= u32(texelSize.x) || globalId.y >= u32(texelSize.y)) 
    {
        return;
    }

    let inputValue_Self        = LoadJFAInputValue(vec2i(globalId.xy),                     texelSize);
    let inputValue_Left        = LoadJFAInputValue(vec2i(globalId.xy) + vec2<i32>(-1, 0),  texelSize);
    let inputValue_Right       = LoadJFAInputValue(vec2i(globalId.xy) + vec2<i32>(1, 0),   texelSize);
    let inputValue_Up          = LoadJFAInputValue(vec2i(globalId.xy) + vec2<i32>(0, 1),   texelSize);
    let inputValue_Down        = LoadJFAInputValue(vec2i(globalId.xy) + vec2<i32>(0, -1),  texelSize);
    let inputValue_TopLeft     = LoadJFAInputValue(vec2i(globalId.xy) + vec2<i32>(-1, 1),  texelSize);
    let inputValue_TopRight    = LoadJFAInputValue(vec2i(globalId.xy) + vec2<i32>(1, 1),   texelSize);
    let inputValue_BottomLeft  = LoadJFAInputValue(vec2i(globalId.xy) + vec2<i32>(-1, -1), texelSize);
    let inputValue_BottomRight = LoadJFAInputValue(vec2i(globalId.xy) + vec2<i32>(1, -1),  texelSize);

    let isBoundary = inputValue_Self != inputValue_Left 
                    || inputValue_Self != inputValue_Right 
                    || inputValue_Self != inputValue_Up 
                    || inputValue_Self != inputValue_Down 
                    || inputValue_Self != inputValue_TopLeft 
                    || inputValue_Self != inputValue_TopRight 
                    || inputValue_Self != inputValue_BottomLeft 
                    || inputValue_Self != inputValue_BottomRight;

    var isInside = inputValue_Self == 0;

    var writeValue = vec4<f32>(-1.0, -1.0, select(0.0, 1.0, isInside), 1e10);
    let pos = ThreadIDToNormalizedPos(globalId.xy);

    let interactSphereRadius = max(1.0, _JFA_Uniforms._JFA_InteractSphere.w);
    let distToInteractSphereCenter = length(vec2<f32>(globalId.xy) - _JFA_Uniforms._JFA_InteractSphere.xy);
    let sphereMask = smoothstep(interactSphereRadius * 0.5, 0.0, 
                               abs(distToInteractSphereCenter - interactSphereRadius));
    let posDistort = normalize(vec2<f32>(globalId.xy) - _JFA_Uniforms._JFA_InteractSphere.xy) * sphereMask;

    if (isBoundary) 
    {
        writeValue = vec4<f32>(pos, select(0.0, 1.0, isInside), 0.0);
    }

    textureStore(_JFA_TempBufferOut, globalId.xy, writeValue);
}


// Helper function to get minimum distance point
fn UpdateMinDistance(curPos: vec2<f32>, neighborPoint: vec4<f32>, minInfo: ptr<function, vec4<f32>>) 
{
    let distanceSqr = dot(curPos - neighborPoint.xy, curPos - neighborPoint.xy);
    if (distanceSqr < (*minInfo).w) 
    {
        *minInfo = vec4<f32>(neighborPoint.xyz, distanceSqr);
    }
}

// JFA Iteration kernel
@compute @workgroup_size(THREAD_GROUP_SIZE_X, THREAD_GROUP_SIZE_Y, THREAD_GROUP_SIZE_Z)
fn JFA_Iteration(@builtin(global_invocation_id) globalId: vec3<u32>) 
{
    let texelSize = _JFA_Uniforms._JFA_TexelSize.zw;
    if (globalId.x >= u32(texelSize.x) || globalId.y >= u32(texelSize.y)) 
    {
        return;
    }

    let stepX = _JFA_Uniforms._JFA_JumpDistance.x;
    let stepY = _JFA_Uniforms._JFA_JumpDistance.y;
    var minInfo = vec4<f32>(0.0, 0.0, 0.0, 1e10);
    let pos = ThreadIDToNormalizedPos(globalId.xy);

    UpdateMinDistance(pos, ReadInputBuffer(vec2i(globalId.xy),                             texelSize), &minInfo);
    UpdateMinDistance(pos, ReadInputBuffer(vec2i(globalId.xy) + vec2<i32>(-stepX, -stepY), texelSize), &minInfo);
    UpdateMinDistance(pos, ReadInputBuffer(vec2i(globalId.xy) + vec2<i32>(-stepX, stepY),  texelSize), &minInfo);
    UpdateMinDistance(pos, ReadInputBuffer(vec2i(globalId.xy) + vec2<i32>(-stepX, 0),      texelSize), &minInfo);
    UpdateMinDistance(pos, ReadInputBuffer(vec2i(globalId.xy) + vec2<i32>(0, -stepY),      texelSize), &minInfo);
    UpdateMinDistance(pos, ReadInputBuffer(vec2i(globalId.xy) + vec2<i32>(0, stepY),       texelSize), &minInfo);
    UpdateMinDistance(pos, ReadInputBuffer(vec2i(globalId.xy) + vec2<i32>(stepX, -stepY),  texelSize), &minInfo);
    UpdateMinDistance(pos, ReadInputBuffer(vec2i(globalId.xy) + vec2<i32>(stepX, 0),       texelSize), &minInfo);
    UpdateMinDistance(pos, ReadInputBuffer(vec2i(globalId.xy) + vec2<i32>(stepX, stepY),   texelSize), &minInfo);

    textureStore(_JFA_TempBufferOut, globalId.xy, minInfo);
}


fn GetSignedNormalizedDistance(texValue: vec4<f32>) -> f32 
{
    var normalizedDist = saturate(sqrt(texValue.w) / 1.4142);
    return saturate(normalizedDist);
}

// JFA Generate Distance Field kernel
@compute @workgroup_size(THREAD_GROUP_SIZE_X, THREAD_GROUP_SIZE_Y, THREAD_GROUP_SIZE_Z)
fn JFA_GenerateDistanceField(@builtin(global_invocation_id) globalId: vec3<u32>) 
{
    let texelSize = _JFA_Uniforms._JFA_TexelSize.zw;
    if (globalId.x >= u32(texelSize.x) || globalId.y >= u32(texelSize.y)) 
    {
        return;
    }

    let texValue_Self = ReadInputBuffer(vec2i(globalId.xy), texelSize);
    let texValue_Left = ReadInputBuffer(vec2i(globalId.xy) + vec2<i32>(-1, 0), texelSize);
    let texValue_Right = ReadInputBuffer(vec2i(globalId.xy) + vec2<i32>(1, 0), texelSize);
    let texValue_Down = ReadInputBuffer(vec2i(globalId.xy) + vec2<i32>(0, -1), texelSize);
    let texValue_Up = ReadInputBuffer(vec2i(globalId.xy) + vec2<i32>(0, 1),    texelSize);

    let normalizedDist_Self = GetSignedNormalizedDistance(texValue_Self);
    let normalizedDist_Left = GetSignedNormalizedDistance(texValue_Left);
    let normalizedDist_Right = GetSignedNormalizedDistance(texValue_Right);
    let normalizedDist_Down = GetSignedNormalizedDistance(texValue_Down);
    let normalizedDist_Up = GetSignedNormalizedDistance(texValue_Up);

    var gradient = vec2<f32>(0.0, 0.0);
    gradient.x = (normalizedDist_Right - normalizedDist_Left) / (2.0 * _JFA_Uniforms._JFA_TexelSize.x);
    gradient.y = (normalizedDist_Up - normalizedDist_Down) / (2.0 * _JFA_Uniforms._JFA_TexelSize.y);

    gradient = clamp(gradient, vec2<f32>(-1.0), vec2<f32>(1.0));
    gradient = mix(gradient, -gradient, texValue_Self.z);
    var resultValue = vec4<f32>(gradient * 0.5 + 0.5, 
                                mix(normalizedDist_Self, -normalizedDist_Self, texValue_Self.z) * 0.5 + 0.5, 
                                1.0);
    // var colorInside = mix(vec4<f32>(1.0, 0.0, 0.0, 1.0), vec4<f32>(1.0, 1.0, 0.0, 1.0), 
    //                                 pow(abs(normalizedDist_Self), 0.3));
    // var colorOutside = mix(vec4<f32>(1.0, 0.0, 0.0, 1.0), vec4<f32>(1.0, 0.0, 1.0, 1.0), 
    //                                 pow(abs(normalizedDist_Self), 0.3));
    // var color = mix(colorInside, colorOutside, texValue_Self.z);
    // resultValue = color;
    textureStore(_JFA_TempBufferOut, globalId.xy, resultValue);
}

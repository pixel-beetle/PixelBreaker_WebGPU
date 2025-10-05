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
@group(0) @binding(3) var _JFA_TempBufferOut: texture_storage_2d<rgba32float, write>;

// Helper function to get input value based on mode
fn GetInputValue(sample: vec4<f32>, mode: u32) -> f32 {
    switch (mode) {
        case _JFA_InputValueMode_RChannel: {
            return sample.r;
        }
        case _JFA_InputValueMode_GChannel: {
            return sample.g;
        }
        case _JFA_InputValueMode_BChannel: {
            return sample.b;
        }
        case _JFA_InputValueMode_AChannel: {
            return sample.a;
        }
        case _JFA_InputValueMode_Luminance: {
            return sample.g; // Using green channel for luminance
        }
        default: {
            return sample.r;
        }
    }
}

// Helper function to bound index within texture bounds
fn BoundIndex(id: vec2<i32>, texelSize: vec2<f32>) -> vec2<i32> {
    return clamp(id, vec2<i32>(0), vec2<i32>(texelSize - 1.0));
}

// Helper function to read from temp buffer with bounds checking
fn ReadInputBuffer(id: vec2<i32>, texelSize: vec2<f32>) -> vec4<f32> {
    let boundedId = BoundIndex(id, texelSize);
    return textureLoad(_JFA_TempBufferIn, vec2u(boundedId), 0);
}

// JFA Initialize kernel
@compute @workgroup_size(THREAD_GROUP_SIZE_X, THREAD_GROUP_SIZE_Y, THREAD_GROUP_SIZE_Z)
fn JFA_Initialize(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let texelSize = _JFA_Uniforms._JFA_TexelSize.zw;
    if (globalId.x >= u32(texelSize.x) || globalId.y >= u32(texelSize.y)) {
        return;
    }

    let inputTextureSample = textureLoad(_JFA_InputTexture, globalId.xy, 0);
    let inputValue = GetInputValue(inputTextureSample, _JFA_Uniforms._JFA_InputValueMode);
    let clampedInputValue = saturate(inputValue);

    var isInside = clampedInputValue < _JFA_Uniforms._JFA_InputValueThreshold;
    if (_JFA_Uniforms._JFA_InputInvert > 0.5) {
        isInside = !isInside;
    }

    var writeValue = vec4<f32>(-1.0, -1.0, -1.0, -1.0);
    let pos = vec2<f32>(globalId.xy) * _JFA_Uniforms._JFA_TexelSize.xy + _JFA_Uniforms._JFA_TexelSize.xy * 0.5;

    let interactSphereRadius = max(1.0, _JFA_Uniforms._JFA_InteractSphere.w);
    let distToInteractSphereCenter = length(vec2<f32>(globalId.xy) - _JFA_Uniforms._JFA_InteractSphere.xy);
    let sphereMask = smoothstep(interactSphereRadius * 0.5, 0.0, 
                               abs(distToInteractSphereCenter - interactSphereRadius));
    let posDistort = normalize(vec2<f32>(globalId.xy) - _JFA_Uniforms._JFA_InteractSphere.xy) * sphereMask;

    if (isInside) {
        let texelSizeFloat = vec2<f32>(texelSize);
        writeValue = vec4<f32>(pos, 
                              (f32(globalId.x) * texelSizeFloat.x + f32(globalId.x)) / (texelSizeFloat.x * texelSizeFloat.y), 
                              0.0);
    }

    textureStore(_JFA_TempBufferOut, globalId.xy, writeValue);
}


// Helper function to get minimum distance point
fn UpdateMinDistance(curPos: vec2<f32>, neighborPoint: vec4<f32>, minInfo: ptr<function, vec4<f32>>) {
    // z channel is seed ID
    if (neighborPoint.z >= 0.0) {
        let distanceSqr = dot(curPos - neighborPoint.xy, curPos - neighborPoint.xy);
        if (distanceSqr < (*minInfo).w) {
            *minInfo = vec4<f32>(neighborPoint.xyz, distanceSqr);
        }
    }
}

// JFA Iteration kernel
@compute @workgroup_size(THREAD_GROUP_SIZE_X, THREAD_GROUP_SIZE_Y, THREAD_GROUP_SIZE_Z)
fn JFA_Iteration(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let texelSize = _JFA_Uniforms._JFA_TexelSize.zw;
    if (globalId.x >= u32(texelSize.x) || globalId.y >= u32(texelSize.y)) {
        return;
    }

    let stepX = _JFA_Uniforms._JFA_JumpDistance.x;
    let stepY = _JFA_Uniforms._JFA_JumpDistance.y;
    var minInfo = vec4<f32>(0.0, 0.0, 0.0, 1e10);
    let pos = vec2<f32>(globalId.xy) * _JFA_Uniforms._JFA_TexelSize.xy + _JFA_Uniforms._JFA_TexelSize.xy * 0.5;

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

// JFA Generate Distance Field kernel
@compute @workgroup_size(THREAD_GROUP_SIZE_X, THREAD_GROUP_SIZE_Y, THREAD_GROUP_SIZE_Z)
fn JFA_GenerateDistanceField(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let texelSize = _JFA_Uniforms._JFA_TexelSize.zw;
    if (globalId.x >= u32(texelSize.x) || globalId.y >= u32(texelSize.y)) {
        return;
    }

    let texValue_Self = ReadInputBuffer(vec2i(globalId.xy), texelSize);
    let texValue_Left = ReadInputBuffer(vec2i(globalId.xy) + vec2<i32>(-1, 0), texelSize);
    let texValue_Right = ReadInputBuffer(vec2i(globalId.xy) + vec2<i32>(1, 0), texelSize);
    let texValue_Down = ReadInputBuffer(vec2i(globalId.xy) + vec2<i32>(0, -1), texelSize);
    let texValue_Up = ReadInputBuffer(vec2i(globalId.xy) + vec2<i32>(0, 1),    texelSize);


    let normalizedDist_Self = saturate(sqrt(texValue_Self.w) / 1.4142);
    let normalizedDist_Left = saturate(sqrt(texValue_Left.w) / 1.4142);
    let normalizedDist_Right = saturate(sqrt(texValue_Right.w) / 1.4142);
    let normalizedDist_Down = saturate(sqrt(texValue_Down.w) / 1.4142);
    let normalizedDist_Up = saturate(sqrt(texValue_Up.w) / 1.4142);

    var gradient = vec2<f32>(0.0, 0.0);
    gradient.x = (normalizedDist_Right - normalizedDist_Left) / _JFA_Uniforms._JFA_TexelSize.x;
    gradient.y = (normalizedDist_Up - normalizedDist_Down) / _JFA_Uniforms._JFA_TexelSize.y;

    var resultValue = vec4<f32>(gradient, normalizedDist_Self, 1.0);
    
    textureStore(_JFA_TempBufferOut, globalId.xy, resultValue);
}

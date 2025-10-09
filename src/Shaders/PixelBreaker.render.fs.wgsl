struct Uniforms
{
    _RenderTargetTexelSize: vec4<f32>,
    _ReflectionBoardRectMinMax: vec4<f32>,
    _ReflectionBoardColor: vec4<f32>,
    _MousePosition: vec4<f32>, // xy: pos, z:is pressed, w: button
    _MouseInteractionParams: vec4<f32> // x: radius, y: radial strength, z: swirl strength, w: falloff exponent
}

var<uniform> _Uniforms: Uniforms;
// var _DistanceFieldTexture: texture_2d<f32>;
var<storage, read> _RasterTargetBuffer: array<u32>;

varying vUV: vec2<f32>;

fn UnpackColor(packed: u32) -> vec4<f32> {
    let r = f32((packed >>  0) & 255u) / 255.0;
    let g = f32((packed >>  8) & 255u) / 255.0;
    let b = f32((packed >> 16) & 255u) / 255.0;
    let a = f32((packed >> 24) & 255u) / 255.0;
    return vec4<f32>(r, g, b, a);
}

fn DrawMouseInteractionHint(pixelCoord: vec2<u32>, texelSize: vec4<f32>) -> vec4<f32>
{
    let circleCenter = _Uniforms._MousePosition.xy;
    let circleRadius = _Uniforms._MouseInteractionParams.x;
    let distanceToCenter = length(vec2<f32>(f32(pixelCoord.x), f32(pixelCoord.y)) - circleCenter);
    let distanceToEdge = abs(distanceToCenter - circleRadius);
    let circleEdge = 1.0 - smoothstep(1.5, 2.0, distanceToEdge);

    let button = i32(_Uniforms._MousePosition.w);
    let isButtonPressed = button >= 0;
    let hasWheelAction = _Uniforms._MousePosition.z > 0.5;
    let shouldShowHint = isButtonPressed || hasWheelAction;

    let alpha = select(0.0, circleEdge, shouldShowHint);
    var colorRGB = vec3<f32>(1.0, 1.0, 1.0);
    let colorByButton = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), button == 0);
    colorRGB = select(colorRGB, colorByButton, isButtonPressed);
    let color = vec4<f32>(colorRGB, alpha);
    return color;
}

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs
{
    let texelSize = _Uniforms._RenderTargetTexelSize;
    let textureSize = vec2<u32>(u32(texelSize.z), u32(texelSize.w));
    let pixelCoord = vec2<u32>(fragmentInputs.vUV * vec2<f32>(textureSize));
    let isOutsideTexture = pixelCoord.x >= textureSize.x || pixelCoord.y >= textureSize.y;

    var id1d = pixelCoord.y * textureSize.x + pixelCoord.x;
    id1d = clamp(id1d, 0, textureSize.x * textureSize.y - 1);
    let packedColor = _RasterTargetBuffer[id1d];
    var color = UnpackColor(packedColor);
    
    let isInsideReflectionBoard = pixelCoord.x > u32(_Uniforms._ReflectionBoardRectMinMax.x) 
                                && pixelCoord.y > u32(_Uniforms._ReflectionBoardRectMinMax.y) 
                                && pixelCoord.x < u32(_Uniforms._ReflectionBoardRectMinMax.z) 
                                && pixelCoord.y < u32(_Uniforms._ReflectionBoardRectMinMax.w);

    let reflectionBoardColorFactor = select(0.0, _Uniforms._ReflectionBoardColor.a, isInsideReflectionBoard);
    color = mix(color, _Uniforms._ReflectionBoardColor, reflectionBoardColorFactor);
    color = select(color, vec4<f32>(1.0, 0.0, 0.0, 1.0), isOutsideTexture);
    let mouseInteractionHintColor = DrawMouseInteractionHint(pixelCoord, texelSize);
    color = mix(color, mouseInteractionHintColor, mouseInteractionHintColor.a);
    color.a = 1.0;
    fragmentOutputs.color = color;
}

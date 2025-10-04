// 视频调色 Compute Shader
@group(0) @binding(0) var inputTextureSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var outputTexture: texture_storage_2d<rgba8unorm, write>;

// 自定义浮点数模运算函数
fn fmod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}

struct Uniforms {
    time: f32,           // @default time: 0.0
    brightness: f32,     // @default brightness: 0.0
    contrast: f32,       // @default contrast: 1.0
    saturation: f32,     // @default saturation: 1.0
    hueShift: f32,       // @default hueShift: 0.0
    gamma: f32,          // @default gamma: 1.0
    _padding1: f32,      // @default _padding1: 0.0
    _padding2: f32,      // @default _padding2: 0.0
}

@group(0) @binding(3) var<uniform> uniforms: Uniforms;

// RGB 到 HSV 转换
fn rgb_to_hsv(rgb: vec3<f32>) -> vec3<f32> {
    let r = rgb.r;
    let g = rgb.g;
    let b = rgb.b;
    
    let max_val = max(r, max(g, b));
    let min_val = min(r, min(g, b));
    let delta = max_val - min_val;
    
    var h: f32 = 0.0;
    if (delta != 0.0) {
        if (max_val == r) {
            h = fmod((g - b) / delta, 6.0);
        } else if (max_val == g) {
            h = (b - r) / delta + 2.0;
        } else {
            h = (r - g) / delta + 4.0;
        }
    }
    h = h / 6.0;
    
    let s = select(0.0, delta / max_val, max_val != 0.0);
    let v = max_val;
    
    return vec3<f32>(h, s, v);
}

// HSV 到 RGB 转换
fn hsv_to_rgb(hsv: vec3<f32>) -> vec3<f32> {
    let h = hsv.x * 6.0;
    let s = hsv.y;
    let v = hsv.z;
    
    let c = v * s;
    let x = c * (1.0 - abs(fmod(h, 2.0) - 1.0));
    let m = v - c;
    
    var rgb: vec3<f32>;
    if (h < 1.0) {
        rgb = vec3<f32>(c, x, 0.0);
    } else if (h < 2.0) {
        rgb = vec3<f32>(x, c, 0.0);
    } else if (h < 3.0) {
        rgb = vec3<f32>(0.0, c, x);
    } else if (h < 4.0) {
        rgb = vec3<f32>(0.0, x, c);
    } else if (h < 5.0) {
        rgb = vec3<f32>(x, 0.0, c);
    } else {
        rgb = vec3<f32>(c, 0.0, x);
    }
    
    return rgb + vec3<f32>(m);
}

// 应用伽马校正
fn apply_gamma(color: vec3<f32>, gamma: f32) -> vec3<f32> {
    return pow(color, vec3<f32>(1.0 / gamma));
}

// 应用对比度调整
fn apply_contrast(color: vec3<f32>, contrast: f32) -> vec3<f32> {
    return (color - 0.5) * contrast + 0.5;
}

// 应用亮度调整
fn apply_brightness(color: vec3<f32>, brightness: f32) -> vec3<f32> {
    return color + brightness;
}

// 应用饱和度调整
fn apply_saturation(color: vec3<f32>, saturation: f32) -> vec3<f32> {
    let gray = dot(color, vec3<f32>(0.299, 0.587, 0.114));
    return mix(vec3<f32>(gray), color, saturation);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let dimensions = textureDimensions(outputTexture);
    let coord = vec2<i32>(global_id.xy);
    
    // 检查边界
    if (coord.x >= i32(dimensions.x) || coord.y >= i32(dimensions.y)) {
        return;
    }
    
    let uv = vec2<f32>(coord) / vec2<f32>(dimensions);
    // 采样输入纹理
    let originalColor = textureSampleLevel(inputTexture, inputTextureSampler, uv, 0.0).rgb;
    
    // 应用各种调色效果
    var color = originalColor;
    
    // 1. 亮度调整
    color = apply_brightness(color, uniforms.brightness);
    
    // 2. 对比度调整
    color = apply_contrast(color, uniforms.contrast);
    
    // 3. 伽马校正
    color = apply_gamma(color, uniforms.gamma);
    
    // 4. 饱和度调整
    color = apply_saturation(color, uniforms.saturation);
    
    // 5. 色相偏移
    var hsv = rgb_to_hsv(color);
    hsv.x = fmod(hsv.x + uniforms.hueShift, 1.0);
    color = hsv_to_rgb(hsv);
    
    // 6. 添加一些动态效果（基于时间）
    let time = uniforms.time;
    
    // 添加轻微的色相波动
    let hueWave = sin(time * 0.5) * 0.1;
    hsv = rgb_to_hsv(color);
    hsv.x = fmod(hsv.x + hueWave, 1.0);
    color = hsv_to_rgb(hsv);
    
    // 添加轻微的亮度波动
    let brightnessWave = sin(time * 0.3) * 0.05;
    color = apply_brightness(color, brightnessWave);
    
    // 确保颜色在有效范围内
    color = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
    
    // 写入输出纹理
    textureStore(outputTexture, coord, vec4<f32>(color, 1.0));
}

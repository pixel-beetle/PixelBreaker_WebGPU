

import { Gradient } from 'tweakpane-plugin-gradient';
import * as BABYLON from 'babylonjs';

export class GradientEx
{
    public static Monochrome(valueStart01: number, valueEnd01: number) : Gradient
    {
        const valueStart = valueStart01 * 255;
        const valueEnd = valueEnd01 * 255;
        const gradient = new Gradient({
            points: [
                { time: 0, value: { r: valueStart, g: valueStart, b: valueStart, a: 1 } },
                { time: 1, value: { r: valueEnd, g: valueEnd, b: valueEnd, a: 1 } },
            ],
        });
        return gradient;
    }

    public static HSV( pointCount: number, 
                       startHue01: number = 0, 
                       endHue01: number = 1,
                       startSaturation01: number = 1,
                       endSaturation01: number = 1,
                       startValue01: number = 1,
                       endValue01: number = 1,
                    ) : Gradient
    {
        let points = [];
        for(let i = 0; i < pointCount; i++)
        {
            const time = i / (pointCount - 1);
            const hue = startHue01 + (endHue01 - startHue01) * time;
            const saturation = startSaturation01 + (endSaturation01 - startSaturation01) * time;
            const value = startValue01 + (endValue01 - startValue01) * time;
            const color = BABYLON.Color3.FromHSV(hue * 360, saturation, value);
            points.push({ time: time, value: { r: color.r * 255, g: color.g * 255, b: color.b * 255, a: 1 } });
        }
        const gradient = new Gradient({
            points: points,
        });
        return gradient;
    }
}


export class GradientTexture
{
    private _texture: BABYLON.RawTexture | null = null;
    public get texture(): BABYLON.RawTexture | null
    {
        return this._texture;
    }
    private _width: number = 256;
    private _scene: BABYLON.Scene | null = null;

    constructor(width: number, scene: BABYLON.Scene)
    {
        this._width = width;
        this._scene = scene;
    }

    public UpdateFromTPGradient(gradient: Gradient)
    {
        const data = new Uint8Array(this._width * 4);
        for(let i = 0; i < this._width; i++)
        {
            const color = gradient.getInterpolatedColor(i / (this._width - 1));
            data[i * 4] = Math.round(color.r);
            data[i * 4 + 1] = Math.round(color.g);
            data[i * 4 + 2] = Math.round(color.b);
            data[i * 4 + 3] = Math.round(color.a);
        }

        if(this._texture === null)
        {
            this._texture = new BABYLON.RawTexture(
                null, 
                this._width, 
                1, 
                BABYLON.Engine.TEXTUREFORMAT_RGBA, 
                this._scene!, 
                false, 
                false, 
                BABYLON.Texture.BILINEAR_SAMPLINGMODE,
                BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE);
        }

        this._texture!.update(data);
    }

    public UpdateAndGetTextureFromTPGradient(gradient: Gradient) : BABYLON.RawTexture | null
    {
        this.UpdateFromTPGradient(gradient);
        return this._texture;
    }

    public Release()
    {
        if(this._texture !== null)
        {
            this._texture.dispose();
            this._texture = null;
        }
    }
}

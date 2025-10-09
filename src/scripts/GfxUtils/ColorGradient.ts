

import { Gradient, GradientPoint } from 'tweakpane-plugin-gradient';
import * as BABYLON from 'babylonjs';

export class GradientUtils
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

    public static Viridis() : Gradient
    {
        const gradient = new Gradient({
            points: [
                { time: 0, value: { r: 68, g: 1, b: 84, a: 1 } },
                { time: 0.2, value: { r: 69, g: 50, b: 125, a: 1 } },
                { time: 0.33, value: { r: 51, g: 131, b: 163, a: 1 } },
                { time: 0.5, value: { r: 33, g: 144, b: 141, a: 1 } },
                { time: 0.6, value: { r: 36, g: 159, b: 135, a: 1 } },
                { time: 0.85, value: { r: 184, g: 222, b: 48, a: 1 } },
                { time: 1, value: { r: 253, g: 231, b: 36, a: 1 } },
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

    public static TryParseFromString(string: string) : Gradient | null
    {
        let hexStrings: string[] = [];
        let points:{time: number, value: {r: number, g: number, b: number, a: number}}[] = [];

        // Pattern A: any number of #ffffff, separated by - , ; or white space
        const patternA = /\b(#?[0-9a-fA-F]{6})\b/g;
        const matchA = string.matchAll(patternA);
        if(matchA)
        {
            for(const match of matchA)
            {
                let hexString = match[1];
                if(!hexString.startsWith('#'))
                {
                    hexString = '#' + hexString;
                }
                hexStrings.push(hexString);
            }
        }

        // Pattern B: color hunt URL
        const patternB = /https?:\/\/colorhunt\.co\/palette\/(?<paletteId>[0-9a-zA-Z-]+)/;
        const matchB = string.match(patternB);
        if(matchB)
        {
            const paletteId = matchB.groups?.paletteId;
            if(paletteId && paletteId.length % 6 === 0)
            {
                for(let i = 0; i < paletteId.length; i+=6)
                {
                    const hexString = paletteId.slice(i, i + 6);
                    hexStrings.push('#' + hexString);
                }
            }
        }





        if(hexStrings.length === 0)
        {
            return null;
        }

        const timeStep = 1.0 / (hexStrings.length);
        const startTime = timeStep / 2;
        for(let i = 0; i < hexStrings.length; i++)
        {
            const color = BABYLON.Color3.FromHexString(hexStrings[i]);
            points.push({ time: startTime + i * timeStep, value: { r: color.r * 255, g: color.g * 255, b: color.b * 255, a: 1 } });
        }
        return new Gradient({ points: points });
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

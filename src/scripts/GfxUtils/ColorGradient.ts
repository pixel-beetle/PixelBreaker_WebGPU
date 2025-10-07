

import { Gradient } from 'tweakpane-plugin-gradient';
import * as BABYLON from 'babylonjs';

export class GradientEx
{
    private _internalGradient: Gradient;
    constructor(gradient: Gradient)
    {
        this._internalGradient = gradient;
    }

    public Evaluate(time: number) : BABYLON.Color4
    {
        const color = this._internalGradient.getInterpolatedColor(time);
        return new BABYLON.Color4(color.r, color.g, color.b, color.a);
    }

    public AddPoint(time: number, color: BABYLON.Color4)
    {
        this._internalGradient.addPoint({ time: time, value: { r: color.r, g: color.g, b: color.b, a: color.a } });
    }


    public static Monochrome() : GradientEx
    {
        const gradient = new GradientEx(new Gradient({
            points: [
                { time: 0, value: { r: 255, g: 0, b: 255, a: 1 } },
                { time: 1, value: { r: 0, g: 255, b: 255, a: 1 } },
            ],
        }));
        return gradient;
    }

    public static Rainbow(pointCount: number) : GradientEx
    {
        let points = [];
        for(let i = 0; i < pointCount; i++)
        {
            const time = i / (pointCount - 1);
            const color = BABYLON.Color3.FromHSV(time, 1, 1);
            points.push({ time: time, value: { r: color.r * 255, g: color.g * 255, b: color.b * 255, a: 1 } });
        }
        const gradient = new Gradient(new Gradient({
            points: points,
        }));
        return new GradientEx(gradient);
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

    public Update(gradient: GradientEx)
    {
        const data = new Uint8Array(this._width * 4);
        for(let i = 0; i < this._width; i++)
        {
            const color = gradient.Evaluate(i / (this._width - 1));
            data[i * 4] = Math.round(color.r * 255);
            data[i * 4 + 1] = Math.round(color.g * 255);
            data[i * 4 + 2] = Math.round(color.b * 255);
            data[i * 4 + 3] = Math.round(color.a * 255);
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
    
    public UpdateAndGetTexture(gradient: GradientEx) : BABYLON.RawTexture | null
    {
        this.Update(gradient);
        return this._texture;
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

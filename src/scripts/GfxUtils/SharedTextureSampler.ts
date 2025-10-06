import * as BABYLON from 'babylonjs';


export class SharedTextureSamplerCollection
{
    private _bilinear_repeat: BABYLON.TextureSampler | null = null;
    public get BilinearRepeat() : BABYLON.TextureSampler
    {
        if (!this._bilinear_repeat)
        {
            this._bilinear_repeat = new BABYLON.TextureSampler();
            this._bilinear_repeat.samplingMode = BABYLON.Texture.BILINEAR_SAMPLINGMODE;
            this._bilinear_repeat.wrapR = BABYLON.Texture.WRAP_ADDRESSMODE;
            this._bilinear_repeat.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
            this._bilinear_repeat.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        }
        return this._bilinear_repeat;
    }


    private _bilinear_clamp: BABYLON.TextureSampler | null = null;
    public get BilinearClamp() : BABYLON.TextureSampler
    {
        if (!this._bilinear_clamp)
        {
            this._bilinear_clamp = new BABYLON.TextureSampler();
            this._bilinear_clamp.samplingMode = BABYLON.Texture.BILINEAR_SAMPLINGMODE;
            this._bilinear_clamp.wrapR = BABYLON.Texture.CLAMP_ADDRESSMODE;
            this._bilinear_clamp.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
            this._bilinear_clamp.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        }
        return this._bilinear_clamp;
    }


    private _nearest_repeat: BABYLON.TextureSampler | null = null;
    public get NearestRepeat() : BABYLON.TextureSampler
    {
        if (!this._nearest_repeat)
        {
            this._nearest_repeat = new BABYLON.TextureSampler();
            this._nearest_repeat.samplingMode = BABYLON.Texture.NEAREST_SAMPLINGMODE;
            this._nearest_repeat.wrapR = BABYLON.Texture.WRAP_ADDRESSMODE;
            this._nearest_repeat.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
            this._nearest_repeat.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        }
        return this._nearest_repeat;
    }


    private _nearest_clamp: BABYLON.TextureSampler | null = null;
    public get NearestClamp() : BABYLON.TextureSampler
    {
        if (!this._nearest_clamp)
        {
            this._nearest_clamp = new BABYLON.TextureSampler();
            this._nearest_clamp.samplingMode = BABYLON.Texture.NEAREST_SAMPLINGMODE;
            this._nearest_clamp.wrapR = BABYLON.Texture.CLAMP_ADDRESSMODE;
            this._nearest_clamp.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
            this._nearest_clamp.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        }
        return this._nearest_clamp;
    }


    private _trilinear_repeat: BABYLON.TextureSampler | null = null;
    public get TrilinearRepeat() : BABYLON.TextureSampler
    {
        if (!this._trilinear_repeat)
        {
            this._trilinear_repeat = new BABYLON.TextureSampler();
            this._trilinear_repeat.samplingMode = BABYLON.Texture.TRILINEAR_SAMPLINGMODE;
            this._trilinear_repeat.wrapR = BABYLON.Texture.WRAP_ADDRESSMODE;
            this._trilinear_repeat.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
            this._trilinear_repeat.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        }
        return this._trilinear_repeat;
    }


    private _trilinear_clamp: BABYLON.TextureSampler | null = null;
    public get TrilinearClamp() : BABYLON.TextureSampler
    {
        if (!this._trilinear_clamp)
        {
            this._trilinear_clamp = new BABYLON.TextureSampler();
            this._trilinear_clamp.samplingMode = BABYLON.Texture.TRILINEAR_SAMPLINGMODE;
            this._trilinear_clamp.wrapR = BABYLON.Texture.CLAMP_ADDRESSMODE;
            this._trilinear_clamp.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
            this._trilinear_clamp.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        }
        return this._trilinear_clamp;
    }
}
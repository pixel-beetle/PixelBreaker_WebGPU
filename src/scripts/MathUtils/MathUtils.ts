export default class MathUtils
{
    public static NextPowerOfTwo(value: number) : number
    {
        return Math.pow(2, Math.ceil(Math.log2(value)));
    }

    public static PreviousPowerOfTwo(value: number) : number
    {
        return Math.pow(2, Math.floor(Math.log2(value)));
    }

    public static IsPowerOfTwo(value: number) : boolean
    {
        return (value & (value - 1)) === 0;
    }
}
export interface UIPropertyOptions {
    label?: string;
    category?: string;
    order?: number;
    readonly?: boolean;
    hidden?: boolean;
}

export interface NumberOptions extends UIPropertyOptions {
    options?: { [key: string]: number };
    min?: number;
    max?: number;
    step?: number;
    format?: (value: number) => string;
}

export interface ButtonOptions extends UIPropertyOptions {
    text?: string;
    icon?: string;
}

export interface ToggleOptions extends UIPropertyOptions {
    onText?: string;
    offText?: string;
}

export interface ColorOptions extends UIPropertyOptions {
    format?: 'hex' | 'rgb' | 'hsl';
}

export interface ListOptions extends UIPropertyOptions {
    options: { text: string; value: any }[];
}

export type UIDecorator = (target: any, propertyKey: string) => void;

const UI_PROPERTIES_KEY = 'uiProperties';

export interface UIPropertyMetadata {
    propertyKey: string;
    options: UIPropertyOptions;
    type: 'slider' | 'button' | 'toggle' | 'color' | 'list' | 'text' | 'number';
}

export function GetUIProperties(target: any): UIPropertyMetadata[] {
    return Reflect.getMetadata(UI_PROPERTIES_KEY, target) || [];
}

export function SetUIProperties(target: any, properties: UIPropertyMetadata[]): void {
    Reflect.defineMetadata(UI_PROPERTIES_KEY, properties, target);
}

export function AddUIProperty(target: any, property: UIPropertyMetadata): void {
    const properties = GetUIProperties(target);
    properties.push(property);
    SetUIProperties(target, properties);
}


export function UIProperty(options: UIPropertyOptions = {}): UIDecorator {
    return function(target: any, propertyKey: string) {
        AddUIProperty(target, {
            propertyKey,
            options,
            type: 'text'
        });
    };
}


export function Slider(options: NumberOptions = {}): UIDecorator {
    return function(target: any, propertyKey: string) {
        AddUIProperty(target, {
            propertyKey,
            options: options,
            type: 'slider'
        });
    };
}


export function Button(options: ButtonOptions = {}): UIDecorator {
    return function(target: any, propertyKey: string) {
        AddUIProperty(target, {
            propertyKey,
            options,
            type: 'button'
        });
    };
}


export function Toggle(options: ToggleOptions = {}): UIDecorator {
    return function(target: any, propertyKey: string) {
        AddUIProperty(target, {
            propertyKey,
            options,
            type: 'toggle'
        });
    };
}

export function Color(options: ColorOptions = {}): UIDecorator {
    return function(target: any, propertyKey: string) {
        AddUIProperty(target, {
            propertyKey,
            options,
            type: 'color'
        });
    };
}

export function List(options: ListOptions): UIDecorator {
    return function(target: any, propertyKey: string) {
        AddUIProperty(target, {
            propertyKey,
            options,
            type: 'list'
        });
    };
}

export function NumberInput(options: NumberOptions = {}): UIDecorator {
    return function(target: any, propertyKey: string) {
        AddUIProperty(target, {
            propertyKey,
            options,
            type: 'number'
        });
    };
}

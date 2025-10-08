import { BindingParams, ButtonParams } from "@tweakpane/core";
import { GradientBladeParams } from "tweakpane-plugin-gradient";

export interface UIPropertyOptions 
{
    tab?: string;
    category?: string;
}

export interface BindingOptions extends UIPropertyOptions 
{
    bindingParams?: BindingParams;
}


export interface ButtonOptions extends UIPropertyOptions 
{
    buttonParams?: ButtonParams;
}

export interface GradientOptions extends UIPropertyOptions 
{
    label?: string;
}


export type UIDecorator = (target: any, propertyKey: string) => void;

const UI_PROPERTIES_KEY = 'uiProperties';

export interface UIPropertyMetadata {
    propertyKey: string;
    options: UIPropertyOptions;
    type: 'binding' | 'button' | 'gradient';
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


export function UIBinding(options: BindingOptions = {}): UIDecorator {
    return function(target: any, propertyKey: string) {
        AddUIProperty(target, {
            propertyKey,
            options,
            type: 'binding'
        });
    };
}



export function UIButton(options: ButtonOptions = {}): UIDecorator {
    return function(target: any, propertyKey: string) {
        AddUIProperty(target, {
            propertyKey,
            options,
            type: 'button'
        });
    };
}


export function UIGradient(options: GradientOptions = {}): UIDecorator {
    return function(target: any, propertyKey: string) {
        AddUIProperty(target, {
            propertyKey,
            options,
            type: 'gradient'
        });
    };
}
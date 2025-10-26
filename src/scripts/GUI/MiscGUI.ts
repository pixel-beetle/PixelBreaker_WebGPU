import { Application } from "../Application";

export class MiscGUI 
{
    private _posterElement: HTMLElement | null = null;
    private _controlHintElement: HTMLElement | null = null;

    public AttachControlHintElement(parentNode: HTMLElement): void
    {
        if (!this._controlHintElement)
        {
            this._controlHintElement = this.CreateControlHintElement();
        }
        parentNode.appendChild(this._controlHintElement);
    }

    private CreateNotSupportedHintElement(): HTMLElement
    {
        const posterElement = document.createElement('div');
        posterElement.style.position = 'absolute';
        posterElement.style.top = '0';
        posterElement.style.left = '0';
        posterElement.style.width = '100%';
        posterElement.style.height = '100%';
        posterElement.style.backgroundColor = 'black';
        posterElement.style.display = 'flex';
        posterElement.style.justifyContent = 'center';
        posterElement.style.alignItems = 'center';
        posterElement.style.color = 'white';
        posterElement.style.fontSize = '96px';
        posterElement.style.fontWeight = 'bold';
        posterElement.style.zIndex = '1000';
        return posterElement;
    }

    private CreatePosterElement(): HTMLElement
    {
        const containerElement = document.createElement('div');
        containerElement.style.position = 'absolute';
        containerElement.style.top = '0';
        containerElement.style.left = '0';
        containerElement.style.width = '100%';
        containerElement.style.height = '100%';
        containerElement.style.zIndex = '2000';

        const coverElement = document.createElement('div');
        coverElement.style.position = 'absolute';
        coverElement.style.top = '0';
        coverElement.style.left = '0';
        coverElement.style.width = '100%';
        coverElement.style.height = '100%';
        coverElement.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
        coverElement.style.display = 'flex';
        coverElement.style.justifyContent = 'center';
        coverElement.style.alignItems = 'center';
        coverElement.style.color = 'white';
        coverElement.style.fontSize = '96px';
        coverElement.style.fontWeight = 'bold';
        coverElement.style.zIndex = '1000';
        coverElement.textContent = "CLICK TO START";
        // add a poster image under the text
        const imageElement = document.createElement('img');
        imageElement.style.position = 'absolute';
        imageElement.style.top = '0';
        imageElement.style.left = '0';
        imageElement.style.width = '100%';
        imageElement.style.height = '100%';
        imageElement.src = './poster.png';
        imageElement.alt = 'poster';

        imageElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        imageElement.style.display = 'flex';
        imageElement.style.justifyContent = 'center';
        imageElement.style.alignItems = 'center';
        imageElement.style.color = 'white';
        imageElement.style.fontSize = '96px';
        imageElement.style.fontWeight = 'bold';
        imageElement.style.zIndex = '10';

        containerElement.appendChild(imageElement);
        containerElement.appendChild(coverElement);
        
        return containerElement;
    }

    private CreateControlHintElement(): HTMLElement
    {
        const controlHintElement = document.createElement('div');
        controlHintElement.style.position = 'relative';
        controlHintElement.style.top = '0';
        controlHintElement.style.left = '0';
        controlHintElement.style.width = 'auto';
        controlHintElement.style.height = 'auto';
        controlHintElement.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
        controlHintElement.style.display = 'flex';
        controlHintElement.style.justifyContent = 'center';
        controlHintElement.style.alignItems = 'center';
        controlHintElement.style.color = 'white';
        controlHintElement.style.fontSize = '14px';
        controlHintElement.style.zIndex = '1000';
        // control hint content
        controlHintElement.innerHTML = 
        `<br>
        Keyboard<br>
          [P]      : Toggle UI<br>
          [Space]  : Play / Pause<br>
          [V]      : Rlay / Pause Video Only<br>
          [R]      : Restart<br>
          [X]      : Toggle SDF Force<br>
          [C]      : Toggle Particle Flocking<br>
          [A/D]    : Move Reflection Board<br>
        <br>
        <br>
        Mouse<br>
          [Left]   : Push<br>
          [Right]  : Drag<br>
          [Middle] : Swirl<br>
          [Wheel]  : Change Radius<br>
        <br>`
        return controlHintElement;
    }


    public CreateFirstScreenElements(isWebGPUSupported: boolean, application: Application): void 
    {
        if (!isWebGPUSupported)
        {
            this._posterElement = this.CreateNotSupportedHintElement();
            this._posterElement.innerHTML = "WebGPU NOT SUPPORTED";
            document.body.appendChild(this._posterElement);
            console.error("WebGPU is not supported, please use a browser that supports WebGPU, try Chrome or Edge.");
            return;
        }
        else
        {
            // ask for first interaction
            this._posterElement = this.CreatePosterElement();
            document.body.style.backgroundColor = 'black';
            document.body.appendChild(this._posterElement);
            this._posterElement.addEventListener('click', () => {
                this._posterElement!.remove();
                this._posterElement = null;
                application.OnFirstInteractionGot();
            });
        }
    }



    public Release(): void 
    {
        if (this._posterElement) {
            this._posterElement.remove();
            this._posterElement = null;
        }
    }

}
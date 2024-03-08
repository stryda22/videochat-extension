import {ChatruletkaDriver} from "../content-driver-chatruletka";

export class FaceapiModule {
    private static instanceRef: FaceapiModule;
    private faceApiLoaded = false;
    public timeout: NodeJS.Timeout | undefined;
    public static defaults = {
        autoBan: false,
        skipMale: false,
        skipFemale: false,
        skipUnderage: false, // Added skipUnderage setting
        enableFaceApi: false,
    }
    public settings = [
        {
            type: "header",
            text: chrome.i18n.getMessage("genderRecognition")
        },
        {
            type: "checkbox",
            important: false,
            key: "enableFaceApi",
            text: chrome.i18n.getMessage("forcedApi"),
            tooltip: chrome.i18n.getMessage("tooltipForcedRecognition"),
            enable: () => {
                if (!this.faceApiLoaded)
                    this.injectFaceApi()
            },
            disable: () => {
                this.setText('')
                if (!this.faceApiLoaded)
                    this.injectFaceApi()
            }
        },
        {
            type: "checkbox",
            important: false,
            key: "skipMale",
            text: chrome.i18n.getMessage("skip_males"),
            tooltip: chrome.i18n.getMessage("tooltipSkipMales"),
            enable: () => {
                if (!this.faceApiLoaded)
                    this.injectFaceApi()
            },
            disable: () => {
                this.setText('')
                if (!this.faceApiLoaded)
                    this.injectFaceApi()
            }
        },
        {
            type: "checkbox",
            important: false,
            key: "skipFemale",
            text: chrome.i18n.getMessage("skip_females"),
            tooltip: chrome.i18n.getMessage("tooltipSkipFemales"),
            enable: () => {
                if (!this.faceApiLoaded)
                    this.injectFaceApi()
            },
            disable: () => {
                this.setText('')
                if (!this.faceApiLoaded)
                    this.injectFaceApi()
            }
        },
        {
            type: "checkbox",
            important: false,
            key: "skipUnderage", // Added skipUnderage setting
            text: chrome.i18n.getMessage("skip_underage"),
            tooltip: chrome.i18n.getMessage("tooltipSkipUnderage"),
            enable: () => {
                if (!this.faceApiLoaded)
                    this.injectFaceApi()
            },
            disable: () => {
                this.setText('')
                if (!this.faceApiLoaded)
                    this.injectFaceApi()
            }
        },
        {
            type: "checkbox",
            important: false,
            key: "autoBan",
            text: chrome.i18n.getMessage("autoskip"),
            tooltip: chrome.i18n.getMessage("tooltipAutoskip")
        },
    ]
    private driver: ChatruletkaDriver;
    // TODO: fix faceapi type
    private faceapi: any | undefined;

    private constructor(driver: ChatruletkaDriver) {
        this.driver = driver
    }

    static initInstance(driver: ChatruletkaDriver): FaceapiModule {
        if (FaceapiModule.instanceRef === undefined) {
            FaceapiModule.instanceRef = new FaceapiModule(driver);
        }

        return FaceapiModule.instanceRef;
    }

    public start(delay: number) {
        if (this.faceApiLoaded) {
            clearTimeout(this.timeout)
            this.timeout = setTimeout(this.detectGender.bind(this), delay)
        }
    }

    public stop() {
        if (this.faceApiLoaded) {
            clearInterval(this.timeout)
        }
    }

    public setText(text: string) {
        (document.getElementById("remoteFace") as HTMLElement).innerHTML = text
    }

    public injectFaceApi() {
        setTimeout(async () => {
            this.faceapi = await import('@vladmandic/face-api/dist/face-api.esm.js')
            console.time("faceapi: loading models")
            // monkeyPatch fixes firefox compatibility, chrome works without it,
            // I wasted 2 hours on this, but got a lot of new reasons to hate firefox
            // faceapi performance on firefox is 5x slower than on chrome
            // I don't even know what I hate more now: background service workers or firefox compatibility issues
            this.faceapi.env.monkeyPatch({
                readFile: async (filePath: string) => {
                    filePath = filePath.replace(/^(moz-extension:\/)([\d\w])/g, 'moz-extension://$2')
                    if (filePath.endsWith('bin')) {
                        return new Uint8Array(await (await fetch(filePath)).arrayBuffer())
                    } else {
                        return await (await fetch(filePath)).text()
                    }
                },
                Canvas: HTMLCanvasElement,
                Image: HTMLImageElement,
                ImageData: ImageData,
                Video: HTMLVideoElement,
                createCanvasElement: () => document.createElement('canvas'),
                createImageElement: () => document.createElement('img')
            });
            // @ts-ignore
            await this.faceapi.tf?.setWasmPaths(chrome.runtime.getURL('resources/models') + "/")
            // @ts-ignore
            await this.faceapi.tf.setBackend('wasm');
            // @ts-ignore
            if (this.faceapi.tf?.env().flagRegistry.CANVAS2D_WILL_READ_FREQUENTLY_FOR_GPU) this.faceapi.tf.env().set('CANVAS2D_WILL_READ_FREQUENTLY_FOR_GPU', true);
            // @ts-ignore
            if (this.faceapi.tf?.env().flagRegistry.WEBGL_EXP_CONV) this.faceapi.tf.env().set('WEBGL_EXP_CONV', true);
            // @ts-ignore
            if (this.faceapi.tf?.env().flagRegistry.WEBGL_EXP_CONV) this.faceapi.tf.env().set('WEBGL_EXP_CONV', true);
            // @ts-ignore
            await this.faceapi.tf.enableProdMode();
            // @ts-ignore
            await this.faceapi.tf.ready();
            await this.faceapi.nets.tinyFaceDetector.loadFromDisk(chrome.runtime.getURL('resources/models'))
            await this.faceapi.nets.ageGenderNet.loadFromDisk(chrome.runtime.getURL('resources/models'))
            console.timeEnd("faceapi: loading models")

            this.faceApiLoaded = true

            this.start(200)
        }, 0)
    }

    public async detectGender() {
        if (!this.faceApiLoaded) {
            return
        }
        if (!globalThis.platformSettings.get("skipMale") && !globalThis.platformSettings.get("skipFemale") && !globalThis.platformSettings.get("skipUnderage") && !globalThis.platformSettings.get("enableFaceApi"))
            return
        let stop = false
        let skip_m = false
        let skip_f = false
        let skip_u = false // Added skip_u for skipping underage
        let text = ''
        if (this.driver.stage === 4) {
            this.stop()
            console.time("faceapi: detectAllFaces()")

            let array = await this.faceapi.detectAllFaces(document.getElementById('remote-video') as HTMLVideoElement, new this.faceapi.TinyFaceDetectorOptions()).withAgeAndGender()

            for (let i = 0; i < array.length; i++) {
                text += `<b>* ${array[i].gender} (${(array[i].genderProbability * 100).toFixed(0) + '%'}), ${(array[i].age).toFixed(0)}</b></br>`
                if (array[i].gender === "male" && Math.ceil(array[i].genderProbability * 100) > 90) {
                    skip_m = true
                    stop = true
                    if (this.driver.modules.stats) {
                        this.driver.modules.stats.increaseCountMales()
                    }
                }
                if (array[i].gender === "female" && Math.ceil(array[i].genderProbability * 100) > 90) {
                    skip_f = true
                    stop = true
                    if (this.driver.modules.stats) {
                        this.driver.modules.stats.increaseCountFemales()
                    }
                }
                if (array[i].age < 18 && globalThis.platformSettings.get("skipUnderage")) {
                    skip_u = true
                    stop = true
                    if (this.driver.modules.stats) {
                        this.driver.modules.stats.increaseUnderageSkip()
                    }
                }
            }

            if (skip_m && globalThis.platformSettings.get("skipMale")) {
                text += `<b>male skipping...</b></br>`;
                (document.getElementsByClassName('buttons__button start-button')[0] as HTMLElement).click()
                console.dir("MALE SKIPPED")

                if (this.driver.modules.stats) {
                    this.driver.modules.stats.increaseMaleSkip()
                    this.driver.modules.stats.decreaseManSkip()
                }

                if (this.driver.modules.blacklist && globalThis.platformSettings.get("autoBan")) {
                    this.driver.modules.blacklist.processAutoBan(this.driver.modules.geolocation.curIps)
                }
            }

            if (skip_f && globalThis.platformSettings.get("skipFemale")) {
                text += `<b>female skipping...</b></br>`;
                (document.getElementsByClassName('buttons__button start-button')[0] as HTMLElement).click()
                console.dir("FEMALE SKIPPED")
                if (this.driver.modules.stats) {
                    this.driver.modules.stats.increaseFemaleSkip()
                    this.driver.modules.stats.decreaseManSkip()
                }

                if (this.driver.modules.blacklist && globalThis.platformSettings.get("autoBan")) {
                    this.driver.modules.blacklist.processAutoBan(this.driver.modules.geolocation.curIps)
                }
            }

            if (skip_u && globalThis.platformSettings.get("skipUnderage")) {
                text += `<b>underage skipping...</b></br>`;
                (document.getElementsByClassName('buttons__button start-button')[0] as HTMLElement).click()
                console.dir("UNDERAGE SKIPPED")
                if (this.driver.modules.stats) {
                    this.driver.modules.stats.increaseUnderageSkip()
                }
                if (this.driver.modules.blacklist && globalThis.platformSettings.get("autoBan")) {
                    this.driver.modules.blacklist.processAutoBan(this.driver.modules.geolocation.curIps)
                }
            }

            if (!globalThis.platformSettings.get("skipMale") && !globalThis.platformSettings.get("skipFemale") && !globalThis.platformSettings.get("skipUnderage") && !globalThis.platformSettings.get("enableFaceApi"))
                return

            if (text !== '')
                this.setText(text);

            console.timeEnd("faceapi: detectAllFaces()")
        }

        if (!stop) {
            this.start(500)
        }
    }
}

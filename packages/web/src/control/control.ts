import { Glue42Core } from "@glue42/core";
import { LocalWebWindow } from "../windows/my";
import { RemoteCommand, ControlDomain, LayoutRemoteCommand } from "./commands";

export class Control {
    public static CONTROL_METHOD = "GC.Control";

    private myWindow: LocalWebWindow | undefined;
    private interop!: Glue42Core.Interop.API;
    private callbacks: { [domain: string]: (command: RemoteCommand) => void } = {};
    private logger!: Glue42Core.Logger.API;

    public start(interop: Glue42Core.Interop.API, logger: Glue42Core.Logger.API) {
        this.interop = interop;
        this.logger = logger;
        this.interop.register(Control.CONTROL_METHOD, async (arg: any) => {
            const command = arg as RemoteCommand;
            logger.info(`received control command ${JSON.stringify(command)}`);
            if (command.domain === "windows") {
                if (!this.myWindow) {
                    return;
                }
                return (this.myWindow as any)[command.command].call(this.myWindow, command.args);
            }
            if (command.domain === "layouts") {
                const callback = this.callbacks[command.domain];
                if (callback) {
                    callback(command);
                }
            }
        });
    }

    public send(command: RemoteCommand, target: Glue42Core.Interop.Instance) {
        if (!this.interop) {
            throw new Error("Control not started");
        }
        this.logger.info(`sending control command ${JSON.stringify(command)} to ${JSON.stringify(target)}}`);
        return this.interop.invoke(Control.CONTROL_METHOD, command, target);
    }

    public subscribe(domain: ControlDomain, callback: (command: RemoteCommand) => void) {
        this.callbacks[domain] = callback;
    }

    public setLocalWindow(window: LocalWebWindow) {
        this.myWindow = window;
    }
}

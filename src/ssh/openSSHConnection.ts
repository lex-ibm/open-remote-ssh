import {EventEmitter} from "events";
import {ISSHConnection, SSHConnectConfig, SSHConstants, SSHDefaultOptions, SSHTunnelConfig} from "./sshConnectionCommons";
import {ChildProcessWithoutNullStreams, spawn} from "child_process";
import fs from "fs";
import {isWindows} from "../common/platform";

export default class OpenSSHConnection extends EventEmitter implements ISSHConnection {
    public config: SSHConnectConfig;

    private __$connectPromise: Promise<OpenSSHConnection> | null = null;
    private __retries: number = 0;
    private __err: Error | null = null;
    private sshProcess: ChildProcessWithoutNullStreams | null = null;
    private tunnelConfig: SSHTunnelConfig;
    private askPass: string | undefined;

    constructor(options: SSHConnectConfig, tunnelConfig: SSHTunnelConfig, askPass?: string) {
        super();
        this.config = Object.assign({}, SSHDefaultOptions, options);
        this.config.uniqueId = this.config.uniqueId || `${this.config.username}@${this.config.host}`;
        this.tunnelConfig = tunnelConfig;
        this.askPass = askPass;
    }

    override emit(channel: string, status: string, payload?: any): boolean {
        super.emit(channel, status, this, payload);
        return super.emit(`${channel}:${status}`, this, payload);
    }

    connect(config?: SSHConnectConfig): Promise<OpenSSHConnection> {
        this.config = Object.assign(this.config, config);
        ++this.__retries;

        if (this.__$connectPromise) {
            return this.__$connectPromise;
        }

        this.__$connectPromise = new Promise((resolve, reject) => {
            this.emit(SSHConstants.CHANNEL.SSH, SSHConstants.STATUS.BEFORECONNECT);
            if (!this.config || typeof this.config === 'function' || !(this.config.host || this.config.sock) || !this.config.username) {
                reject(`Invalid SSH connection configuration host/username can't be empty`);
                this.__$connectPromise = null;
                return;
            }

            if (this.config.identity) {
                if (!fs.existsSync(this.config.identity)) {
                    delete this.config.identity;
                }
            }

            const sshArgs = this.getSSHArgs();
            this.sshProcess = spawn(isWindows ? 'ssh.exe' : 'ssh', sshArgs, {
                env: {
                    ...process.env,
                    SSH_ASKPASS: this.askPass || ''
                }
            });

            this.sshProcess.on('exit', (code, signal) => {
                console.log(`ssh process exited with code ${code} and signal ${signal}`);
                this.emit(SSHConstants.CHANNEL.SSH, SSHConstants.STATUS.DISCONNECT);
                this.sshProcess = null;
                if (code !== 0 || signal !== null) {
                    this.__err = new Error(`SSH Connection failed with code ${code} and signal ${signal}`);
                }
                if (this.config.reconnect && this.__retries < this.config.reconnectTries!) {
                    setTimeout(() => {
                        this.__$connectPromise = null;
                        this.connect();
                    }, this.config.reconnectDelay);
                } else {
                    reject(this.__err || `SSH Connection failed`);
                }
            });

            this.sshProcess.on('spawn', () => {
                this.emit(SSHConstants.CHANNEL.SSH, SSHConstants.STATUS.CONNECT);
                this.__retries = 0;
                this.__err = null;
                resolve(this);
            });

            this.sshProcess.stdout.on('data', (data) => {
                console.log(`stdout: ${data}`);
            });

            this.sshProcess.stderr.on('data', (data) => {
                console.error(`stderr: ${data}`);
            });
        });
        return this.__$connectPromise;
    }

    exec(cmd: string, tester: (stdout: string, stderr: string) => boolean, params?: Array<string>): Promise<{ stdout: string; stderr: string }> {
        cmd += (Array.isArray(params) ? (' ' + params.join(' ')) : '');
        return this.connect().then(() => {
            let stdout = '';
            let stderr = '';
            return new Promise((resolve, _reject) => {
                this.sshProcess!.stdin.write(cmd + '\n');
                this.sshProcess!.stdout.on('data', function (data: Buffer | string) {
                    stdout += data.toString();
                    if (tester(stdout, stderr)) {
                        return resolve({ stdout, stderr });
                    }
                });
                this.sshProcess!.stderr.on('data', function (data: Buffer | string) {
                    stderr += data.toString();
                    if (tester(stdout, stderr)) {
                        return resolve({ stdout, stderr });
                    }
                });
            });
        });
    }

    disconnect(): Promise<void> {
        this.emit(SSHConstants.CHANNEL.SSH, SSHConstants.STATUS.BEFOREDISCONNECT);
        if (this.sshProcess) {
            this.sshProcess.kill();
            this.sshProcess = null;
        }
        return Promise.resolve();
    }

    private getSSHArgs(): string[] {
        const args: string[] = ['-v', '-T'];
        if (this.tunnelConfig) {
            args.push('-D', `${this.tunnelConfig.localPort}`);
        }
        if (this.config.identity) {
            args.push('-i', this.config.identity.toString());
        }
        if (this.config.port) {
            args.push('-p', this.config.port.toString());
        }
        if (this.config.username) {
            args.push(this.config.username + '@' + this.config.host);
        } else {
            args.push(this.config.host!);
        }
        return args;
    }
}
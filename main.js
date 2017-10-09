'use strict';

const nmmes = require('nmmes-backend');
const Logger = nmmes.Logger;
const hasbin = require('hasbin');
const moment = require('moment');
require('moment-duration-format');
const ffmpeg = require('fluent-ffmpeg');
const chalk = require('chalk');
const fs = require('fs-extra');
const Path = require('path');
const onDeath = require('death');
const filesize = require('filesize');
const merge = require('lodash.merge');
const Promise = require('bluebird').config({
    cancellation: true,
    warnings: {
        wForgottenReturn: false
    }
});

/**
 * Arguments
 * ffmpeg - path to ffmpeg
 * tmpDir - path to store videos currently being encoded
 */

let queries = {
    formats: new Promise((res, rej) => {
        ffmpeg.getAvailableFormats(function(err, results) {
            if (err) return rej(err);
            res(results);
        });
    }),
    codecs: new Promise((res, rej) => {
        ffmpeg.getAvailableCodecs(function(err, results) {
            if (err) return rej(err);
            res(results);
        });
    }),
    encoders: new Promise((res, rej) => {
        ffmpeg.getAvailableEncoders(function(err, results) {
            if (err) return rej(err);
            res(results);
        });
    }),
    filters: new Promise((res, rej) => {
        ffmpeg.getAvailableFilters(function(err, results) {
            if (err) return rej(err);
            res(results);
        });
    }),
}

module.exports = class Encoder extends nmmes.Module {
    constructor(args) {
        super(require('./package.json'), {
            noStrict: true
        });

        this.args = merge(Encoder.defaults(), args);

        if (this.args.ffmpeg)
            ffmpeg.setFfprobePath(args.ffmpeg);
    }
    verifyFfmpegInstall() {
        let args = this.args;
        Logger.trace('Verifying ffmpeg install...');
        return new Promise((resolve, reject) => {
            // Make sure ffmpeg is installed, if not, throw err
            hasbin(args.ffmpeg || 'ffmpeg', function(found) {
                if (!found)
                    return reject(new Error('ffmpeg was not found. ffmpeg must be installed.'));
                resolve();
            });
        })
    }
    runEncoder() {
        let _self = this;
        Logger.trace('Running encoder...');
        return new Promise((resolve, reject, onCancel) => {
            // Logger.debug('[' + chalk.yellow.bold('FFMPEG') + ']', '[FRAMES PER SECOND]', chalk.yellow('[PERCENT COMPLETED]'),
            //     '[CURRENT TIME]', '|', '[TIME ELAPSED]', '[RELATIVE SPEED]', chalk.blue('[ETA]'), chalk.blue('[ESTIMATED FILE SIZE]'));
            _self.encoder
                .on('error', function(error, stdout, stderr) {
                    Logger.debug('[FFMPEG] STDOUT:\n', stdout, '[FFMPEG] STDERR:\n', stderr);
                    _self.removeDeathListener();
                    reject(error);
                })
                .on('end', function(stdout, stderr) {
                    _self.removeDeathListener();
                    resolve();
                })
                .run();

            onCancel(_self.encoder.kill.bind(_self.encoder));
        });
    }
    verifyCapabilities() {
        let _self = this;
        const streams = Object.values(this.map.streams);
        Logger.trace('Verifying ffmpeg capabilities...');
        return new Promise((resolve, reject) => {
            let checks = [];
            Promise.props(queries).then((capabilities) => {
                for (let pos in streams) {
                    const stream = streams[pos];
                    const identifier = stream.map.split(':');
                    const input = identifier[0];
                    const index = identifier[1];
                    const metadata = _self.video.input.metadata[input].streams[index];

                    // TODO: Check pixel format
                    if (stream['pixel_format'])
                        checks.push(new Promise((resolve, reject) => {
                            // reject(new Error('pixel format not supported'));
                            return resolve();
                        }));

                    // Check codec support
                    if (stream['c:' + pos])
                        checks.push(new Promise((resolve, reject) => {
                            if (capabilities.encoders[stream['c:' + pos]])
                                return resolve();

                            reject(new Error('Encoder codec ' + chalk.bold(stream['c:' + pos]) + ' is not supported by installed ffmpeg.'))
                        }));
                }
                Promise.all(checks).then(resolve, reject);
            }).catch(reject);
        });
    }
    probeOutput() {
        let _self = this;
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(_self.video.output.path, function(err, metadata) {
                if (err) return reject(err);

                metadata.streams = metadata.streams.reduce((obj, stream) => {
                    stream.input = 0;
                    obj[stream.index] = stream;
                    return obj;
                }, {});

                _self.video.output.metadata = metadata;
                resolve();
            });
        });
    }
    executable(map) {
        let _self = this;
        const args = this.args;
        const video = this.video;
        this.map = map;

        // Provide some insight for debugging
        // Logger.trace(`Module executable called with the following data:\n`, video);
        Logger.trace(`Module executable called with the following arguments:\n`, args);

        // Setup encoder
        this.startTime = new Date();
        this.encoder = ffmpeg(video.input.path).renice(15);

        // Set encoder output
        this.encoder.output(video.output.path);

        // Apply default options
        this.encoder
            .outputOptions('-c', 'copy');

        // Get framerate of first stream
        const frameRate = video.input.metadata[0].streams[0].avg_frame_rate;

        // Watch for kill signal
        this.removeDeathListener = onDeath(function(signal, err) {
            Logger.trace('Signal receieved:', signal, err);
            _self.encoder.kill(signal);
            _self.removeDeathListener();
        });

        Logger.trace('Defaults', this.args.defaults);

        // Map default values
        const streams = Object.values(map.streams);
        for (let pos in streams) {

            // This chunk just gets the stream's metadata
            const stream = streams[pos];
            const identifier = stream.map.split(':');
            const input = identifier[0];
            const index = identifier[1];
            const metadata = video.input.metadata[input].streams[index];

            for (let [key, value] of Object.entries(this.args.defaults[metadata.codec_type])) {
                key = key.replace(/\{POS\}/g, pos);
                if (!stream[key] || Array.isArray(stream[key])) {
                    Logger.debug(`Mapping default option [${chalk.bold(key+"="+value)}] to ${metadata.codec_type} stream [${chalk.bold(stream.map)}]`);
                    map.streams[pos][key] = value;
                }
            }

            // Keep original pixel format for video stream if none is already defined
            if (metadata.codec_type === 'video' && (!map.streams[pos].pixel_format || !map.streams[pos].pix_fmt)) {
                if (~metadata.pix_fmt.indexOf('12le') || ~metadata.pix_fmt.indexOf('12be')) {
                    map.streams[pos].pixel_format = 12;
                } else if (~metadata.pix_fmt.indexOf('10le') || ~metadata.pix_fmt.indexOf('10be')) {
                    map.streams[pos].pixel_format = 10;
                }
            }
        }

        for (let [key, value] of Object.entries(this.args.defaults.container)) {
            if (!map.format[key]) {
                Logger.debug(`Mapping default option [${chalk.bold(key+"="+value)}] to format.`);
                map.format[key] = value;
            }
        }

        // Apply format output map options
        for (const [key, value] of Object.entries(map.format)) {
            Logger.trace(`Applying option [${chalk.bold(key+"="+value)}] to format.`);
            this.encoder.outputOptions('-' + key, value);
        }

        // Apply streams output map options
        for (const [index, stream] of Object.entries(map.streams)) {
            for (const [key, value] of Object.entries(stream)) {
                if (!Array.isArray(value)) {
                    if (typeof value === 'undefined' || value === '') continue;
                    Logger.trace(`Applying option [${chalk.bold(key+"="+value)}] to stream [${chalk.bold(stream.map)}].`);
                    this.encoder.outputOptions('-' + key, value);
                } else {
                    for (let subValue of value) {
                        Logger.trace(`Applying option [${chalk.bold(key+"="+subValue)}] to stream [${chalk.bold(stream.map)}].`);
                        this.encoder.outputOptions('-' + key, subValue);
                    }
                }
            }
        }

        this.encoder
            .on('start', function(commandLine) {
                Logger.trace('[FFMPEG] Query:', commandLine);
            })
            .on('progress', function(progress) {
                let elapsed = moment.duration(moment().diff(_self.startTime), 'milliseconds');
                let processed = momentizeTimemark(progress.timemark);
                let precent = progress.percent ? progress.percent.toFixed(1) : ((processed.asMilliseconds() / 1000 / video.input.metadata[0].format.duration) * 100).toFixed(1);
                _self.elapsedFormated = elapsed.format('hh:mm:ss', {
                    trim: false,
                    forceLength: true
                });

                // let speed = 'x' + getSpeedRatio(progress.timemark, elapsed);
                let speed = (progress.currentFps / frameRate).toFixed(3);
                let eta = moment.duration((100 - precent) / 100 * video.input.metadata[0].format.duration * (1 / speed), 'seconds').format('hh:mm:ss', {
                    trim: false,
                    forceLength: true
                });

                Logger.info('[' + chalk.yellow.bold('FFMPEG') + ']', 'Processing:', progress.currentFps + 'fps', chalk.yellow(precent + '%'),
                    '[' + progress.timemark + ']', '|', _self.elapsedFormated, '[' + (isNaN(speed) ? '~' : 'x' + speed) + ']', chalk.blue(eta));

                _self.progress = {
                    fps: progress.currentFps,
                    percent: precent,
                    processed: processed,
                    frames: progress.frames,
                    elapsed: _self.elapsedFormated,
                    eta: eta,
                    speed: speed
                };
            });

        return new Promise((resolve, reject, onCancel) => {
            let promise = _self
                .verifyFfmpegInstall.call(_self)
                .then(_self.verifyCapabilities.bind(_self))
                .then(() => fs.ensureDir(video.output.dir))
                .then(_self.runEncoder.bind(_self))
                .then(_self.probeOutput.bind(_self))
                .then(resolve, reject);

            onCancel(promise.cancel.bind(promise));
        });
    };

    static defaults() {
        return {
            defaults: {
                container: {},
                audio: {},
                video: {
                    'c:{POS}': 'libx265'
                },
                subtitle: {}
            }
        };
    }
}

function momentizeTimemark(timemark) {

    let hours = parseInt(timemark.substring(0, timemark.indexOf(':')), 10);
    let minutes = parseInt(timemark.substring(timemark.indexOf(':') + 1, timemark.lastIndexOf(':')), 10);
    let seconds = parseFloat(timemark.substr(timemark.lastIndexOf(':') + 1));

    return moment.duration().add(hours, 'h').add(minutes, 'm').add(seconds, 's');
}

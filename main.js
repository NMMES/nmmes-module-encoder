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
const math = require('mathjs');
const Promise = require('bluebird').config({
    cancellation: true,
    warnings: {
        wForgottenReturn: false
    }
});

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
    hardware: new Promise((res, rej) => {
        let hardware = {
            vaapi: []
        };

        fs.pathExists('/dev/dri/renderD128', (err, exists) => {
            if (err) return rej(err);

            if (exists)
                hardware.vaapi.push(`/dev/dri/renderD128`);

            return res(hardware);
        });
    })
}

module.exports = class Encoder extends nmmes.Module {
    constructor(args) {
        super(require('./package.json'));

        this.options = Object.assign(nmmes.Module.defaults(Encoder), args);

        // if (this.options.ffmpeg)
        //     ffmpeg.setFfprobePath(args.ffmpeg);
    }
    verifyFfmpegInstall() {
        let options = this.options;
        Logger.trace('Verifying ffmpeg install...');
        return new Promise((resolve, reject) => {
            // Make sure ffmpeg is installed, if not, throw err
            hasbin(options.ffmpeg || 'ffmpeg', function(found) {
                if (!found)
                    return reject(new Error('ffmpeg was not found. ffmpeg must be installed.'));
                resolve();
            });
        })
    }
    runEncoder() {
        let _self = this;
        Logger.trace('Running encoder...');
        return new Promise((resolve, reject) => {
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
        });
    }
    async verifyCapabilities() {
        const streams = Object.values(this.map.streams);
        Logger.trace('Verifying ffmpeg capabilities...');
        let checks = [];
        let capabilities = await Promise.props(queries);

        if (this.options['hardware-decoding'] && capabilities.hardware.vaapi.length) {
            Logger.trace(`Hardware accelerated decoding enabled.`);
            this.map.format.input['hwaccel'] = 'vaapi';
            this.map.format.input['vaapi_device'] = capabilities.hardware.vaapi.shift();
        }

        for (let pos in streams) {
            const stream = streams[pos];
            const identifier = stream.map.split(':');
            const input = identifier[0];
            const index = identifier[1];
            const metadata = this.video.input.metadata[input].streams[index];

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
        return Promise.all(checks);
    }
    async executable(map) {
        let _self = this;
        const options = this.options;
        const video = this.video;
        this.map = map;

        // Provide some insight for debugging
        // Logger.trace(`Module executable called with the following data:\n`, video);
        Logger.trace(`Encoder executable called with the following options:\n`, options);

        this.startTime = new Date();

        await this.verifyFfmpegInstall();
        await this.verifyCapabilities();

        // Setup encoder
        this.encoder = ffmpeg(video.input.path).renice(15);

        // Set encoder output
        await fs.ensureDir(video.output.dir);
        this.encoder.output(video.output.path);

        // Apply default options
        this.encoder
            .outputOptions('-c', 'copy');

        // Get framerate of first stream
        const frameRate = math.eval(video.input.metadata[0].streams[0].avg_frame_rate);

        // Watch for kill signal
        this.removeDeathListener = onDeath(function(signal, err) {
            Logger.trace('Signal receieved:', signal, err);
            _self.encoder.kill(signal);
            _self.removeDeathListener();
        });

        const ffmpegStreamOptions = {
            video: {
                'c:{POS}': this.options['video-codec'],
                'preset': this.options['preset'],
                'pixel_format': this.options['bitdepth'],
                'crf': this.options['quality']
            }
        };
        let ffmpegFormatOutputOptions = {

        };

        if (this.options.preview) {
            const duration = video.input.metadata[0].format.duration;
            ffmpegFormatOutputOptions.ss = duration / 2;
            ffmpegFormatOutputOptions.t = ffmpegFormatOutputOptions.ss + 30 <= duration ? 30 : duration - ffmpegFormatOutputOptions.ss;
        }

        // Map default values
        const streams = Object.values(map.streams);
        for (let pos in streams) {

            // This chunk just gets the stream's metadata
            const stream = streams[pos];
            const identifier = stream.map.split(':');
            const input = identifier[0];
            const index = identifier[1];
            const metadata = video.input.metadata[input].streams[index];
            const streamType = metadata.codec_type;

            for (let [key, value] of Object.entries(ffmpegStreamOptions[streamType] || {})) {
                key = key.replace(/\{POS\}/g, pos);
                if (!stream[key] || Array.isArray(stream[key])) {
                    Logger.trace(`Mapping default option [${chalk.bold(key+"="+value)}] to ${metadata.codec_type} stream [${chalk.bold(stream.map)}]`);
                    map.streams[pos][key] = value;
                }
            }

            // Keep original pixel format for video stream if none is already defined
            if (metadata.codec_type === 'video' && !(map.streams[pos].pixel_format || map.streams[pos].pix_fmt)) {
                if (~metadata.pix_fmt.indexOf('12le') || ~metadata.pix_fmt.indexOf('12be')) {
                    map.streams[pos].pixel_format = 12;
                } else if (~metadata.pix_fmt.indexOf('10le') || ~metadata.pix_fmt.indexOf('10be')) {
                    map.streams[pos].pixel_format = 10;
                } else {
                    map.streams[pos].pixel_format = 8;
                }
            }
        }

        for (let [key, value] of Object.entries(ffmpegFormatOutputOptions)) {
            if (!map.format.output[key]) {
                Logger.debug(`Mapping default option [${chalk.bold(key+"="+value)}] to format.`);
                map.format.output[key] = value;
            }
        }

        // Apply format output map options
        for (const [key, value] of Object.entries(map.format.output)) {
            Logger.trace(`Applying option [${chalk.bold(key+"="+value)}] to format.`);
            this.encoder.outputOptions('-' + key, value);
        }
        // Apply format input map options
        for (const [key, value] of Object.entries(map.format.input)) {
            Logger.trace(`Applying option [${chalk.bold(key+"="+value)}] to format.`);
            this.encoder.inputOptions('-' + key, value);
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
                    '[' + progress.timemark + ']', '|', _self.elapsedFormated, '[' + chalk.yellow(isNaN(speed) ? '~' : 'x' + speed) + ']', chalk.blue(eta));

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

        await this.runEncoder();
        await video._initializeOutput.call(this.video);
        return {};
    };
    static options() {
        return {
            'video-codec': {
                default: 'libx265',
                describe: 'Video codec to encode the video to.',
                choices: ['libx264', 'libx265'],
                type: 'string',
                group: 'Video:'
            },
            'preview': {
                default: false,
                describe: 'Only encode a 30 second preview of the video starting at middle of video.',
                type: 'boolean',
                // conflicts: 'delete',
                group: 'General:'
            },
            'preset': {
                default: 'fast',
                describe: 'Encoder preset.',
                choices: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow', 'placebo'],
                type: 'string',
                group: 'Video:'
            },
            // IDEA: Add options for custom settings for stream and format
            'quality': {
                default: 19,
                describe: 'Sets the crf quality target.',
                type: 'number',
                group: 'Video:'
            },
            'bitdepth': {
                default: 0,
                describe: 'Forces video streams to be encoded at a specific bitdepth. Set to 0 to maintain original bitdepth.',
                type: 'number',
                choices: [0, 8, 10, 12],
                group: 'Video:'
            },
            'hardware-decoding': {
                default: false,
                describe: 'Attempt to use hardware decoding acceleration. This can actually increase total processing time in most cases.',
                type: 'boolean',
                group: 'Video:'
            },
        };
    }
}

function momentizeTimemark(timemark) {

    let hours = parseInt(timemark.substring(0, timemark.indexOf(':')), 10);
    let minutes = parseInt(timemark.substring(timemark.indexOf(':') + 1, timemark.lastIndexOf(':')), 10);
    let seconds = parseFloat(timemark.substr(timemark.lastIndexOf(':') + 1));

    return moment.duration().add(hours, 'h').add(minutes, 'm').add(seconds, 's');
}

# NMMES-module-encoder

An encoder module for nmmes-backend.

## Dependencies

- [nmmes-backend](https://github.com/NMMES/nmmes-backend) - Required in order to run this module.

### Installation
[![NPM](https://nodei.co/npm/nmmes-module-encoder.png?compact=true)](https://nodei.co/npm/nmmes-module-encoder/)

## Usage

```javascript
import {Video, Logger} from 'nmmes-backend';
import encoder from 'nmmes-module-encoder';

let video = new Video({
    input: {
        path: '/home/user/videos/video.mp4'
    },
    output: {
        path: '/home/user/videos/encoded-video.mkv'
    },
    modules: [new encoder({
        defaults: {
            video: {
                'c:{POS}': 'libx265'
            }
        }
    })]
});

video.on('stop', function(err) {
    if (err)
        return Logger.error('Error encoding video', err);

    Logger.log('Video encoding complete.');
});

video.start();
```

## Options

You may pass the encoder class an optional options object.

```javascript
new encoder({
    ffmpeg: '/usr/bin/ffmpeg' // If the encoder is unable to access ffmpeg
    // from your path, you may manually specify it here
    defaults: {
        container: {    // Options that are applied to the container if not already set
            't': 30     // Will only encode 30 seconds worth of video
        },
        audio: {        // Options that are applied to audio streams if not already set
            'ac': 2      // Sets the default number of audio channels to 2
        },
        video: {        // Options that are applied to video streams if not already set
            'c:{POS}': 'libx265' // Sets the default video codec to hevc/x265
        },
        subtitle: {}    // Options that are applied to subtitle streams if not already set
    }
});
```

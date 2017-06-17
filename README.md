# NMMES-module-encoder
An encoder module for nmmes-backend.

### Dependencies
- [nmmes-backend](https://github.com/NMMES/nmmes-backend) - Required in order to run this module.

### Usage
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

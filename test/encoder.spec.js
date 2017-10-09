const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const assert = chai.assert;
const Encoder = require('../main');
const Video = require('nmmes-backend').Video;
const Path = require('path');
const os = require('os');
const fs = require('fs');
const ffprobe = require('fluent-ffmpeg').ffprobe;

suite('Encoder', function() {
    let encoder = new Encoder({
        defaults: {
            video: {
                preset: 'ultrafast'
            }
        }
    });
    let video = new Video({
        modules: [encoder],
        input: {
            path: 'test/nmmes-test-files/video/hale_bopp_1-(invalidCrop240p)-480p[yuv420p][mpeg1]-noadu-nosub.mpg'
        },
        output: {
            path: Path.resolve(os.tmpdir(), 'nmmes-backend-test.mkv')
        }
    });
    suite('#constructor(info, options = {})', function() {
        test('should return an encoder instance', function() {
            assert.instanceOf(encoder, Encoder, 'module is not an instance of Encoder');
        });
    });
    suite('#run()', function() {
        this.timeout(1000 * 60 * 2); // 2 minutes
        test('should encode the video correctly', function(done) {
            video.run().then(function() {
                assert(fs.existsSync(video.output.path), 'output file does not exist');
                ffprobe(video.output.path, function(err, metadata) {
                    assert.ifError(err);
                    assert.strictEqual(metadata.streams[0].codec_name, 'hevc', 'video stream codec is not hevc');
                    done();
                });
            }, done);
        });
    });
});

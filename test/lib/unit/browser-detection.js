'use strict';

var browserDetection = require('../../../src/lib/browser-detection');

describe('browser-detection', function () {
  describe('isOperaMini', function () {
    it('returns true for an Opera Mini user agent', function () {
      var actual = browserDetection.isOperaMini('Opera/9.80 (Android; Opera Mini/7.6.35766/35.5706; U; en) Presto/2.8.119 Version/11.10');

      expect(actual).to.be.true;
    });

    it('returns false for an Opera user agent', function () {
      var actual = browserDetection.isOperaMini('Opera/9.80 (X11; Linux i686; Ubuntu/14.10) Presto/2.12.388 Version/12.16');

      expect(actual).to.be.false;
    });
  });

  describe('isAndroidFirefox', function () {
    it('returns true for an Android Firefox user agent', function () {
      var phone = browserDetection.isAndroidFirefox('Mozilla/5.0 (Android; Mobile; rv:40.0) Gecko/40.0 Firefox/40.0');
      var tablet = browserDetection.isAndroidFirefox('Mozilla/5.0 (Android; Tablet; rv:40.0) Gecko/40.0 Firefox/40.0');

      expect(phone).to.be.true;
      expect(tablet).to.be.true;
    });

    it('returns false for any other Firefox browser', function () {
      var ios = browserDetection.isAndroidFirefox('Mozilla/5.0 (iPhone; CPU iPhone OS 8_3 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) FxiOS/1.0 Mobile/12F69 Safari/600.1.4');
      var mac = browserDetection.isAndroidFirefox('Mozilla/5.0 (Macintosh; Intel Mac OS X x.y; rv:10.0) Gecko/20100101 Firefox/10.0');
      var pc = browserDetection.isAndroidFirefox('Mozilla/5.0 (Windows NT x.y; Win64; x64; rv:10.0) Gecko/20100101 Firefox/10.0');
      var linux = browserDetection.isAndroidFirefox('Mozilla/5.0 (Maemo; Linux armv7l; rv:10.0) Gecko/20100101 Firefox/10.0 Fennec/10.0');

      expect(ios).to.be.false;
      expect(mac).to.be.false;
      expect(pc).to.be.false;
      expect(linux).to.be.false;
    });
  });

  describe('getIEVersion', function () {
    it('returns null if not IE', function () {
      var actual = browserDetection.getIEVersion('Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36');

      expect(actual).to.be.null;
    });

    it('returns 7 if IE7', function () {
      var actual = browserDetection.getIEVersion('Mozilla/4.0(compatible; MSIE 7.0b; Windows NT 6.0)');

      expect(actual).to.equal(7);
    });

    it('returns 8 if IE8', function () {
      var actual = browserDetection.getIEVersion('Mozilla/5.0 (compatible; MSIE 8.0; Windows NT 6.1; Trident/4.0; GTB7.4; InfoPath.2; SV1; .NET CLR 3.3.69573; WOW64; en-US)');

      expect(actual).to.equal(8);
    });

    it('returns 9 if IE9', function () {
      var actual = browserDetection.getIEVersion('Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0)');

      expect(actual).to.equal(9);
    });

    it('returns 10 if IE10', function () {
      var actual = browserDetection.getIEVersion('Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)');

      expect(actual).to.equal(10);
    });

    it('returns 11 if IE11', function () {
      var actual = browserDetection.getIEVersion('Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; AS; rv:11.0) like Gecko');

      expect(actual).to.equal(11);
    });
  });
});
const assert = require('assert');
const func = require('../index');
let {isUrl,
    isFile,
    getDomainName,
    isDomainsEquals,
    getFileName,
    getFileDest,
    replaceUrl,
    sliceVersionPostfix} = func;

describe('#isUrl()', function(){
    it('should return true when the value is url', function(){
        assert.equal(true, isUrl('http://mysite.com'));
        assert.equal(true, isUrl('https://mysite.com'));
        assert.equal(true, isUrl('//mysite.com'));
        assert.equal(false, isUrl('./mysite.com'));
        assert.equal(false, isUrl('../mysite.com'));
        assert.equal(false, isUrl('/mysite.com'));
    });
});

describe('#isFile()', function(){
    it('should return true when the value is file', function(){
        assert.equal(true, isFile('http://mysite.com/myfile.css'));
        assert.equal(true, isFile('https://mysite.com/myfile.css?566566'));
        assert.equal(true, isFile('./mysite.com/myfile.css'));
        assert.equal(true, isFile('../mysite.com/myfile.css?566566'));
        assert.equal(false, isFile('http://mysite.com/'));
        assert.equal(false, isFile('http://mysite.com/asd.css/'));
    });
});

describe('#getDomainName()', function(){
    it('should return domain name', function(){
        assert.equal('mysite.com', getDomainName('http://mysite.com/myfile.css'));
        assert.equal('mysite.com', getDomainName('https://mysite.com/myfile.css'));
    });
});

describe('#isDomainsEquals()', function(){
    it('should return true when values equals ', function(){
        assert.equal(true, isDomainsEquals('http://mysite.com/myfile.css', 'https://mysite.com/myfile.css'));
        assert.equal(true, isDomainsEquals('http://mysite.com/myfile.css', 'https://mysite.com/'));
        assert.equal(true, isDomainsEquals('http://mysite.com/myfile.css', 'https://mysite.com'));
        assert.equal(false, isDomainsEquals('https://mysite.com/myfile.css', 'https://mysite.ru/myfile.css'));
        assert.equal(false, isDomainsEquals('https://mysite.com/myfile.css', 'https://mysite.ru/'));
        assert.equal(false, isDomainsEquals('https://mysite.com/myfile.css', 'https://mysite.ru'));
    });
});

describe('#getFileName()', function(){
    it('should return filename', function(){
        assert.equal('mysite/myfile.css', getFileName('http://mysite.com/myfile.css', 'mysite'));
    });
});

describe('#getFileDest()', function(){
    it('should return filedest', function(){
        assert.equal('mysite', getFileDest('http://mysite.com/myfile.css', 'mysite'));
        assert.equal('mysite/mydir', getFileDest('http://mysite.com/mydir/myfile.css', 'mysite'));
    });
});

describe('#replaceUrl()', function(){
    it('should return replaced url', function(){
        assert.equal('mysite', replaceUrl('http://mysite.com/myfile.css', 'mysite'));
        assert.equal('mysite/mydir', replaceUrl('http://mysite.com/mydir/myfile.css', 'mysite'));
    });
});

describe('#sliceVersionPostfix()', function(){
    it('should return filename without version postfix', function(){
        assert.equal('http://mysite.com/myfile.css', sliceVersionPostfix('http://mysite.com/myfile.css?566566'));
        assert.equal('../mydir/myfile.css', sliceVersionPostfix('../mydir/myfile.css?566566'));
    });
});


const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const download = require('download');
const mkdirp = require('mkdirp');
const zipFolder = require('zip-folder');


function getParentPath(path) {
    let match;

    if (/^\//.test(path)) return -1;
    match = path.match(/(\.\/)?(\.\.\/)/g);
    if (!match) return 0;

    return match.length;
}

//TODO: Переписать красиво

function joinPath(parentPath, joiningPath) {
    let count = getParentPath(joiningPath);
    let path;

    if (count === -1) {
        path = parentPath.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i)[0];
        path += joiningPath;
    }
    if (count === 0) {
        if (/\.\w+$/i.test(parentPath)) path = parentPath.slice(0, parentPath.lastIndexOf('/')) + '/' + joiningPath.replace(/^\.\//, '');
        else path = parentPath + '/' + joiningPath.replace(/^\.\//, '');
    }
    if (count > 0) {
        if (/\.\w+$/i.test(parentPath)) count = count + 1;
        path = parentPath.match(/(?:https?:\/\/)?(www\.)?(?:[^\/]+)/g);
        if (count > path.length) throw new Error('Путь не может подняться выше');
        path = path.slice(0, path.length - count);
        path = path.join('/');
        path += '/' + joiningPath.replace(/^(\.\/)?(\.\.\/)+/ig, '');
    }

    return path;
}

function isUrl(path) {
    return /^(?:https?:\/\/|\/\/)/i.test(path);
}

function isFile(path) {
    return /\.[^\/]{2,}$/.test(path);
}

function isAbsulute(path) {
    return /^(?:https?:\/\/|\/\/?)/i.test(path);
}

function getDomainName(url) {
    let domain = url.match(/^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/\n]+)/i);
    return domain ? domain[1] : domain;
}

function isDomainsEquals(mainDomen, additionalDomain) {
    return getDomainName(mainDomen) === getDomainName(additionalDomain);
}

//TODO: Refactor - объединить методы

function findUrls(data, url) {
    let regexp = /url\((['"]?)(?!data:)([\w.;=:,#\/\-%]+)\1\)/igm;
    let urls = [];
    let result;

    while (result = regexp.exec(data)) {
        let path;
        if (isUrl(result[2]) && !isDomainsEquals(url, result[2])) continue;
        if (!isFile(result[2])) continue;
        path = sliceVersionPostfix(replaceUrl(result[2], url));
        if (urls.indexOf(path) == -1) urls.push(path);
    }

    return urls;
}

function findMedia(data, url) {
    let re = /\s+(?:href|src) *= *(['"]?)(\S+)\1/igm;
    let result;
    let media = [];

    while (result = re.exec(data)) {
        let path;
        if (isUrl(result[2]) && !isDomainsEquals(url, result[2])) continue;
        if (!isFile(result[2])) continue;
        path = sliceVersionPostfix(replaceUrl(result[2], url));
        if (media.indexOf(path) == -1) media.push(path);
    }

    return media.filter(filterFiles);
}

function findImports(data) {
    let regexp = /@import\s+(['"]?)([\w.;=:,#\/\-%]+)\1/igm;
    let imports = [];
    let result;

    while (result = regexp.exec(data)) {
        if (imports.indexOf(result[2]) == -1) imports.push(result[2])
    }

    return imports;
}

function filterCss(item) {
    return /\.css[^\/]*$/i.test(item);
}

function filterFiles(item) {
    return /\.(?!php)?[^\/]{2,}$/i.test(item);
}

function replaceAbsoluteUrl(data, domain, dest) {
    let domainName = getDomainName(domain);
    let regexp = new RegExp('(?:https?:\/\/|\/\/)(?:www\.)?' + domainName, 'igm');

    return data.replace(regexp, dest);
}

function replaceAbsolutePath(data, dest) {
    let regexp = /\/(?!\/)/igm;

    return data.replace(regexp, dest + '$&');
}

/*
* Меняем абсолютные пути файлов на относительные
* */
//TODO: Refactor - переписать красиво

function replaceMedia(data, url) {
    data = data.replace(/\s+(href|src) *= *(['"]?)(\S+)\2/igm, function (a, b, c, d) {
        let res;
        if (isUrl(c) && isDomainsEquals(url, c)) {
            res = a.replace(/(?:https?:\/\/)?(?:www\.)?[^\/]+\//i, '');
        } else if (/^\/(?!\/)/.test(d)) {
            res = a.replace('/', '');
            res = res.replace(/js\?[^"']+/, 'js');
            res = res.replace(/css\?[^"']+/, 'css');
        } else {
            res = a;
        }
        return res;
    });
    data = data.replace(/url\((['"]?)(?!data:)([\w.;=:,#\/\-%]+)\1\)/igm, function (a, b, c, d) {
        let res;
        if (isUrl(c) && isDomainsEquals(url, c)) {
            res = a.replace(/(?:https?:\/\/)?(?:www\.)?[^\/]+\//i, '');
        } else if (/^\/(?!\/)/.test(c)) {
            res = a.replace('/', '');
        } else {
            res = a;
        }
        return res;
    });
    return data;
}

function getFileName(url, origDest) {
    return sliceVersionPostfix(
        url.replace(/^(?:https?:\/\/)?(?:www\.)?[^\/]+/i, origDest)
    );
}

function getFileDest(file, origDest) {
    return path.posix.dirname(getFileName(file, origDest));
}

function replaceUrl(file, origUrl) {
    if (isUrl(file)) return file;
    return joinPath(origUrl, file);
}

function sliceVersionPostfix(path) {
    return path.replace(/(\.[^\/]{2,})\?[^\/]*$/, '$1');
}

function downloadTextFile(url) {
    return fetch(url)
        .then(data => data.text())
}

function downloadFiles(files, origDest) {
    return Promise.all(files.map(file => {
        downloadMedia(file, getFileDest(file, origDest)).catch(e => {

        });
    }))
}

function downloadMedia(url, dest) {
    return new Promise((resolve, reject) => {
        mkdirp(dest, function (err) {
            if (!err) {
                download(url, dest).then(() => {
                    resolve();
                }).catch(err => {
                    reject(err);
                })
            } else {
                reject(err);
            }
        });
    });
}

//TODO: Переписать красиво

function replaceUrlsToRelative(css, url) {
    let writeCss = css.replace(/url\((['"]?)(?!data:)([\w.;=:,#\/\-%]+)\1\)/igm, function (a, b, c) {
        if (isUrl(c) && isDomainsEquals(url, c)) {

        } else if (/^\/(?!\/)/.test(c)) {
            let parsedUrl = url.match(/(?:https?:\/\/)?(www\.)?(?:[^\/]+)/ig);
            let count = parsedUrl.slice(1, parsedUrl.length - 1);
            let toTop = '';
            c = c.replace(/^\//, '');
            for (var i = 0; i < count.length; i++) {
                toTop += '../';
            }
            c = 'url(' + toTop + c + ')';
        } else {
            c = 'url(' + c + ')';
        }
        return c;
    });

    return writeCss;
}

function downloadCss(url, origDest) {
    return new Promise((resolve, reject) => {
        downloadTextFile(url)
            .then(css => {
                let fileName = getFileName(url, origDest);
                let dest = getFileDest(url, origDest);
                mkdirp(dest, function (err) {
                    if(err) {
                        reject(err);
                    }
                    else {
                        fs.writeFile(fileName, replaceUrlsToRelative(css, url), err => {
                            if (err) {
                                reject(err);
                            } else {
                                let files = findUrls(css, url);
                                downloadFiles(files, origDest)
                                    .then(() => { resolve() })
                                    .catch(e => { resolve() });
                            }
                        })
                    }
                })
            })
    });
}

//TODO: Переписать красиво

function catcher(url, origDest) {
    let filePath = path.join(origDest, 'index.html');

    downloadTextFile(url)
        .then(html => {
            mkdirp(origDest, function (err) {
                if (!err) {
                    fs.writeFile(filePath, replaceMedia(html, url), 'utf8'); //async op
                    let files = findUrls(html, url) || [];
                    let media = findMedia(html, url) || [];
                    let css = media.filter(filterCss);
                    media = media.filter(function (item) {
                        return item.indexOf('.css') === -1;
                    });
                    files = files.concat(media);
                    Promise.all([Promise.all(files.map(file => {
                        downloadMedia(file, getFileDest(file, origDest));
                    })), Promise.all(css.map(file => {
                        downloadCss(file, origDest);
                    }))]).then(()=> {
                        zipFolder(origDest, origDest + '.zip', function(err) {
                            if(err) {
                                console.log('oh no!', err);
                            } else {
                                console.log('EXCELLENT');
                            }
                        });
                    });
                }
            });
        })
}

module.exports = catcher;

// catcher('http://seasonkrasoty.ru/', 'sz');
const fs = require("fs");
const css = require('css');
const path = require("path");
var sizeOf = require('image-size');
const smallImage = false; // for debugging so file is small and and quick to navigate the image will not work if this is true
/**
 * @param {string} find
 * @param {string} replace
 * @return {string}
 */
String.prototype.replaceAll = function(find, replace) {
    var str = this;
    return str.replace(new RegExp(find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), replace);
};

function processImages(imagePaths, depth, doneCb, queue, outputIn) {
    let inprocess = 0;
    let output = outputIn || {};
    let errors = [];
    let asyncFunc = function (cb) {
        inprocess++;
        return function (err, data) {
            try {
                cb(err,data);
            }
            finally {
                inprocess--;
            }
            if (inprocess === 0) {
                doneCb(errors.length === 0 ? null: errors, output);
            }
        };
    };
    imagePaths.forEach(function (imagePath) {
	fs.readdir(imagePath, asyncFunc(function (err, files) {
            if (err) {
                errors.push("error getting " + imagePath);
                return;
            }
	    files.forEach(function(file){
	        var stat = fs.stat(path.join(imagePath,file), asyncFunc(function (err, stat) {
	            if(stat.isFile()){
			var extension = file.substring(file.lastIndexOf(".")+1);
                        let fullName = path.join(imagePath, file);
			var cleanNameBase = '--' + fullName.toLowerCase().replace(/\.[^.]*$/,'').replace(/\.|_| |\/|\\|'/g, "-");
                        let cleanName = cleanNameBase;
                        let i = 1;

                        while (output[cleanName]) {
                            cleanName = cleanNameBase+ '-' + i;
                            i++;
                        };
                        output[cleanName] = {origFile: fullName};

			//cleanName = cleanName.substring(0, cleanName.lastIndexOf("."));                        

			fs.readFile(path.join(imagePath,file), asyncFunc(function (err, data) {
                            let base64Data = smallImage ? '!image!' : data.toString('base64');
			    sizeOf(path.join(imagePath,file), asyncFunc(function (err, dimensions) {
                                // quick fix for checkbox sprite issues
                                // TODO: revise this with a better solution to the checkbox issue.
                                if (err) {
                                    // probably not an image its ok skip it
                                    return;
                                }

                                output[cleanName].data = "url('data:image/"+extension+";base64,"+base64Data+"')";
			    }));
                        }));
		            
		    }
		    else if(stat.isDirectory()){
		        processImages([path.join(imagePath,file)], depth+1, asyncFunc(function (err, subOutput) {
                        }), queue);
		    }
                }));
            });
	}));
    });
    
}

console.log("Merging built files into a standalone html file.");
let debugMode = false;
let templateFile = null;
let imageBase = '/';
let styleFiles = [];
let outputFile = null;
let imagePaths = [];
let javascript = [];
for (let i = 2; i < process.argv.length; i++) {
    let arg = process.argv[i];

    if (arg == '--debug') {
        debugMode = true;
    }
    else if (process.argv.length > i + 1) {
        if (arg === '--template') {
            templateFile = process.argv[i + 1];
            i++;
        }
        else if (arg === '--image-base') {
            imageBase = process.argv[i + 1];
            i++;
        }
        else if (arg === '--js') {
            javascript.push(process.argv[i + 1].split('/').join(path.sep));
            i++;
        }
        else if (arg === '--images') {
            imagePaths.push(process.argv[i + 1].split('/').join(path.sep));
            i++;
        }
        else if (arg === '--style') {
            styleFiles.push(process.argv[i + 1].split('/').join(path.sep));
            i++;
        }
        else if (arg === '--out') {
            outputFile = process.argv[i + 1].split('/').join(path.sep);
            i++;
        }

    }
}
if(debugMode){
    console.log("Merging in debug mode");
}

console.log(imagePaths);
if (template === null) {
    throw "You must specify a template";
}

var template = fs.readFileSync(templateFile).toString();
var style = styleFiles.map(function (styleFile) {return fs.readFileSync(styleFile).toString();}).join('\n');
function fixStyles(style, imageMap) {
    let styleInfo = css.parse(style);
    let refImageMap = {};
    let invImageMap = {};
    for (let k in imageMap) {
        let entry = imageMap[k];
        if (entry.data) {
            invImageMap[imageBase + entry.origFile] = k;
        }
    };
    styleInfo.stylesheet.rules.forEach(function (rule) {
        if (rule.type === 'rule') {
            rule.declarations.forEach(function (dec) {
                
                if (dec.value) {
                    let valParts = dec.value.split(' ');
                    let url = null;
                    let newParts = [];
                    valParts.forEach(function (part) {
                        newParts.push(part);
                        part = part.trim();
                        let match = part.match(/^url\((.+)\)$/);
                        if (match && rule.selectors.includes('.goog-checkbox-checked')) {
                            console.log("got here", part, match, match && (match[1].indexOf('data:') !== 0 && match && match[1].indexOf('//') !== 0));
                        }

                        //
                        if (match && (match[1].indexOf('data:') !== 0 && match && match[1].indexOf('//') !== 0)) {
                            if (invImageMap[match[1]]) {
                                url= match[1];
                                newParts.pop();
                                newParts.push('var(' + invImageMap[match[1]] +')');
                            }
                            else {
                                if (match[1][0] === '/') {
//                                    console.log("not found", match[1],"in", invImageMap);
                                }
                            }
                        }
                        
                    });
                    if (url) {
                        console.log('setting desc', newParts.join(' '));
                        dec.value = newParts.join(' ');
                    }
                }
            });
        }
        
    });
    return css.stringify(styleInfo);
};

processImages(imagePaths, 1, function(err, images){
    if(err){
	console.error("processImages", err);
        process.exit(1); // exit with an error so make knows
	return;
    }

    
    var javascriptCode = "<script>"+javascript.map(function (filename) {return fs.readFileSync(filename).toString();}).join("\n") +"</script>";
    if(debugMode){
	javascriptCode = "<script src=\"client.libs.js\"></script>\n<script src=\"client.min.js\"></script>";
    }

    let vars = [];
    for (let k in images) {
        vars.push('  ' + k + ':' + images[k].data);
    };
    
    var newFile = template.replace("{STYLE}", "\n:root {\n"+vars.join(";\n") +  "\n}\n" + fixStyles(style, images)).replace("{SCRIPT}", javascriptCode);
    
    fs.writeFileSync(outputFile, newFile);
    console.log("Merge Complete!");
});

// .goog-checkbox-checked {  background: #fff url(../images/check-sprite.gif) no-repeat 2px center; }

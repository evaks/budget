const fs = require("fs");
const path = require("path");
var sizeOf = require('image-size');

/**
 * @param {string} find
 * @param {string} replace
 * @return {string}
 */
String.prototype.replaceAll = function(find, replace) {
    var str = this;
    return str.replace(new RegExp(find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), replace);
};

function processImages(imagesPath, depth, doneCb, queue){			//This whole thing was initially syncronous, but i had to adapt last minute, as sizeOf is asyncronous.
	try{
		queue = queue || [];
		var files = fs.readdirSync(imagesPath);
		files.forEach(function(file){
			var stat = fs.statSync(imagesPath+path.sep+file);
			if(stat.isFile()){
				//console.log("processImages", imagesPath+path.sep+file);
				queue.push(function(entryDoneCB){
					var extension = file.substring(file.lastIndexOf(".")+1);
					var cleanName = file.toLowerCase().replaceAll(" ", "_");
					cleanName = cleanName.substring(0, cleanName.lastIndexOf("."));
					var base64Data = fs.readFileSync(imagesPath+path.sep+file).toString('base64');
					sizeOf(imagesPath+path.sep+file, function (err, dimensions) {						//Hopefully this is synchronous
            // quick fix for checkbox sprite issues
            // TODO: revise this with a better solution to the checkbox issue.
            if (cleanName === 'check-sprite') {
              cleanName = 'goog-checkbox-checked, .goog-checkbox-undetermined';
              entryDoneCB("."+cleanName+" {background: url('data:image/"+extension+";base64,"+base64Data+"') no-repeat 2px center;}");
            } else {
						  entryDoneCB("."+cleanName+" {background-image: url('data:image/"+extension+";base64,"+base64Data+"');background-repeat: no-repeat;display: inline-block;width: "+dimensions.width+"px;height: "+dimensions.height+"px;}");
            }
					});
				});
			}
			else if(stat.isDirectory()){
				processImages(imagesPath+path.sep+file, depth+1, doneCb, queue);
			}
		});
		if(depth===1){
			doneCb(null, queue);
		}
	}
	catch(err){
		doneCb(err);
	}
}

function processQueue(queue, doneCB, output){
	try{
		output = output || [];
		if(queue.length>0){
			var current = queue.pop();
			current(function(newStr){
				output.push(newStr);
				processQueue(queue, doneCB, output);
			});
		}
		else{
			doneCB(null, output);
		}
	}
	catch(err){
		doneCB(err);
	}
}

console.log("Merging built files into a standalone html file.");

var debugMode = (process.argv.length>=3&&process.argv[2]==="debug");

if(debugMode){
	console.log("Merging in debug mode");
}

var template = fs.readFileSync("plugins/pcr/template.html").toString();
var style = fs.readFileSync("output/style.css").toString();
var imagesPath = ["output","resources","htdocs","images"].join(path.sep);

processImages(imagesPath, 1, function(err, queue){
	if(err){
	    console.error("processImages", err);
		return;
	}

	processQueue(queue, function(err, newStyles){
		if(err){
			console.error("processQueue", err)
			return;
		}

		if(debugMode){
			var javascriptCode = "<script src=\"client.libs.js\"></script>\n<script src=\"client.min.js\"></script>";
		}
		else{
			var javascriptCode = "<script>"+fs.readFileSync("output/client.libs.js").toString()+"\n"+fs.readFileSync("output/pcr.js").toString()+"</script>";
		}

		var newFile = template.replace("{STYLE}", style+"\n"+newStyles.join("\n")).replace("{SCRIPT}", javascriptCode);

		fs.writeFileSync("output/pcrviewer.html", newFile);
		console.log("Merge Complete!");
	});
});

"use strict";

let Html = Bedrock.Html;

let main = function () {
    loadSalesList ("november", 2019);
}

let loadSalesList = function (month, year) {
    Bedrock.Http.get ("https://bedrock.brettonw.com/api?event=fetch&url=http://www.supertool.com/forsale/" + month + year + "list.html", function (queryResult) {
        console.log ("Loaded.");

        // records is coming in as a JSON object with the text escaped. we first have to
        // reconstruct the original...
        let content = queryResult.response.content
            .replace (/\\"/, "\"")
            .replace (/\\b/, "\b")
            .replace (/\\t/, "\t")
            .replace (/\\f/, "\f")
            .replace (/\\r/, "\r")
            .replace (/\\n/, "\n")
            .replace (/\\\\/, "\\")
            ;

        // then think about how to convert it into a database
        content = content.replace (/<br>/gi, "\n").replace (/<\/?pre>/gi, "").replace (/&nbsp;/gi, " ").replace (/&amp;/gi, "&").replace (/\s+\n/g, "\n");
        content = content.substring (content.indexOf ("**\n") + 3);
        console.log (content);

        let getImageId = function (url) {
            let matches = url.match (/([^\/]*)\.jpg/i);
            if ((matches != null) && (matches.length > 1)) {
                console.log ("Image Id = " + matches[1]);
                return matches[1];
            }
            return "UNKNOWN";
        }

        // build a spider-like graph connecting the images and records
        let imageIndex = {};
        let addRecordToImage = function (record, imageUrl) {
            let imageId = getImageId (imageUrl);
            if (!(imageId in imageIndex)) {
                imageIndex[imageId] = {
                    id: imageId,
                    imageUrl: imageUrl,
                    recordIds: []
                }
            }
            imageIndex[imageId].recordIds.push (record.id);
            record.imageIds.push (imageId);
            console.log ("Add record (" + record.id + ") to image (" + imageId + ") - " + imageIndex[imageId].recordIds.length + " links");
        }

        // loop over all the lines...
        let records = [];
        let recordIndex = {};
        let currentRecord = null;
        let indent;
        let lines = content.split (/\n/);
        for (let line of lines) {
            if (line.length > 0) {
                // if we don't have a current tool...
                if (currentRecord == null) {
                    // look for a tool code
                    let matches = line.match (/^  [A-Z]+\d+/);
                    if ((matches != null) && (matches.length > 0)) {
                        // this starts the record
                        let id = matches[0].substring (2);

                        // the "body" of each description is indented. the "id" occupies
                        // at least 4 characters, padded with a space at the end. there
                        // are two spaces at the beginning of the line, and at least one
                        // more after that...
                        indent = Math.max (id.length, 4) + 3;
                        console.log (id);
                        recordIndex[id] = currentRecord = {
                            id: id,
                            imageIds: [],
                            title: "",
                            description: "",
                            price: 0,
                            maker: "",
                            condition: ""
                        };
                    }
                }

                // these are only valid if we are in a record...
                if (currentRecord != null) {
                    // look for description
                    let description = line.substring (indent);
                    if (description.charAt(0) != ' ') {
                        currentRecord.description += description + " ";
                    }

                    // look for a link
                    let matches = line.match (/<a href="(http:.*\.jpg)"/);
                    if ((matches != null) && (matches.length > 1)) {
                        let imageUrl = matches[1];
                        addRecordToImage (currentRecord, imageUrl);
                    }

                    // look for a price
                    matches = line.match (/\$(\d+\.\d\d)\s*$/);
                    if ((matches != null) && (matches.length > 1)) {
                        currentRecord.price = matches[1];

                        // get the title from the beginning of the description
                        let semicolon = currentRecord.description.indexOf (";");
                        if (semicolon > 0) {
                            currentRecord.title = currentRecord.description.substring (0, semicolon);
                            currentRecord.description = currentRecord.description.substring (semicolon + 1).trim ();
                        } else {
                            currentRecord.title = "UNTITLED";
                        }

                        // de-hyphenate where the original text was wrapped
                        currentRecord.description = currentRecord.description.replace (/([^-])- /, "$1");

                        // try to find the maker, Stanley is obvious
                        if (currentRecord.id.match (/^ST\d+$/)) {
                            currentRecord.maker = "Stanley";
                        } else {
                            // is it in the title?
                        }

                        // try to find the picture location
                        let locMatches = currentRecord.description.match (/;\s*([^;]+):/);
                        if ((locMatches != null) && (locMatches.length > 1)) {
                            let position = locMatches[1].toLowerCase ();
                            let wordCount = position.split (" ").length;
                            if (wordCount < 5) {
                                if (position.includes ("top") || position.includes ("bottom") || position.includes ("left") || position.includes ("right") || position.includes ("middle")) {
                                    console.log ("POSITION: " + locMatches[1]);
                                    currentRecord.position = position;

                                    // and strip the position off the end of the description
                                    currentRecord.description = currentRecord.description.replace (/;\s*[^;]+:/, "");
                                } else {
                                    console.log ("NO POSITION FOUND (missing keywords): " + position);
                                }
                            } else {
                                console.log ("NO POSITION FOUND (length): " + position);
                            }
                        }

                        // this finishes the record
                        records.push (currentRecord);
                        currentRecord = null;
                    }
                }

            }
        }

        console.log ("Found " + records.length + " records");

        // recursive graph traversal functions
        let touchedRecordIds = {};
        let touchedImageIds = {};
        let collectImageIdsFromRecordId = function (recordId, recordIds, imageIds) {
            if (! (recordId in touchedRecordIds)) {
                //console.log ("Checking Record Id: " + recordId);
                let record = recordIds[recordId] = touchedRecordIds[recordId] = recordIndex[recordId];

                // loop over all of the imageIds in that record
                for (let imageId of record.imageIds) {
                    collectRecordIdsFromImageId (imageId, recordIds, imageIds);
                }
            }
            return Object.keys (imageIds).length;
        }

        let collectRecordIdsFromImageId = function (imageId, recordIds, imageIds) {
            if (!(imageId in touchedImageIds)) {
                //console.log ("Checking Image Id: " + imageId);
                let image = imageIds[imageId] = touchedImageIds[imageId] = imageIndex[imageId];

                // get all the records associated with this image
                for (let recordId of image.recordIds) {
                    collectImageIdsFromRecordId (recordId, recordIds, imageIds);
                }
            }
        }

        // build the image group displays by walking over the records in their natural order
        let Bldr = Bedrock.Html.Builder;
        let display = Bldr.begin ("div", {}).begin ("h2", { innerHTML: month.charAt(0).toUpperCase() + month.slice(1) + " " + year }).end ();
        for (let record of records) {
            let recordIds = {};
            let imageIds = {};
            if (collectImageIdsFromRecordId (record.id, recordIds, imageIds) > 0) {
                let cluster = display.begin ("div", {});
                console.log ("CLUSTER");

                let clusterImages = cluster.begin ("div", { style: {height: "100px", verticalAlign: "middle"}});
                for (let imageId of Object.keys(imageIds).sort ()) {
                    console.log ("  Image Id: " + imageId);
                    let image = imageIndex[imageId];
                    clusterImages.begin ("img", {src: image.imageUrl, style: {height:"90%", margin: "4px"}}).end ();
                }
                clusterImages.end ();

                let clusterRecords = cluster.begin ("div", {});
                for (let recordId of Object.keys(recordIds).sort ()) {
                    console.log ("  Record Id: " + recordId);
                    let displayRecord = recordIndex[recordId];
                    clusterRecords.begin ("div", { innerHTML: recordId + ": " + (("position" in displayRecord) ? (" (" + displayRecord.position + ") ") : "") + displayRecord.title }).end ();
                }
                clusterRecords.end ();
                display.end ();
            }
        }
        document.getElementById ("image-group-display").appendChild (display.end ());
    });
};


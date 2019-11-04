"use strict";

let Html = Bedrock.Html;

let archive = {
    "2019": [
        "2019jan", "2019febr", "march2019", "2019apr", "2019may", "june2019", "2019july", "2019augu", "2019septem", "october2019", "november2019", "xx"
    ],
    "2018": [
        "xx", "xx", "xx", "xx", "xx", "xx", "xx", "xx", "xx", "novem2018", "dec2018"
    ]
};

let months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

let main = function () {
    // get the current date
    let now = new Date ();
    let defaultOption = archive[now.getFullYear()][now.getMonth()];
    let selectElement = document.getElementById ("salesListSelect");
    selectElement.value = defaultOption;
    loadSalesList (defaultOption);
};

let selectSalesList = function () {
    let selectElement = document.getElementById ("salesListSelect");
    let selection = selectElement.options[selectElement.selectedIndex].value;
    loadSalesList (selection);
};

let formatMoney = function (amount) {
    const decimalCount = 2;
    const decimal = ".";
    const thousands = ",";

    let i = parseInt (amount = Math.abs (Number (amount) || 0).toFixed (decimalCount)).toString ();
    let j = (i.length > 3) ? i.length % 3 : 0;

    let dollars = (j ? i.substr (0, j) + thousands : '') + i.substr (j).replace (/(\d{3})(?=\d)/g, "$1" + thousands) + (decimalCount ? decimal + Math.abs (amount - i).toFixed (decimalCount).slice (2) : "");
    return "$" + ((amount < 0) ? "(" + dollars + ")" : dollars);
};

let loadSalesList = function (monthyear) {
    let target = document.getElementById ("image-group-display");
    document.getElementById ("loading-div").style.display = "block";
    Bedrock.Http.get ("https://bedrock.brettonw.com/api?event=fetch&url=http://www.supertool.com/forsale/" + monthyear + "list.html", function (queryResult) {
        console.log ("Loaded Source.");

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
        content = content
            .replace (/<br>/gi, "\n")
            .replace (/<meta [^>]+>/gi, "")
            .replace (/<span [^>]+><\/span>/gi, "")
            .replace (/<\/?pre>/gi, "")
            .replace (/&nbsp;/gi, " ")
            .replace (/&amp;/gi, "&")
            .replace (/\s+\n/g, "\n");
        content = content.substring (content.indexOf ("**\n") + 3);
        console.log (content);

        let getImageId = function (url) {
            let matches = url.match (/([^\/]*)\.jpg/i);
            if ((matches != null) && (matches.length > 1)) {
                //console.log ("Image Id = " + matches[1]);
                return matches[1];
            }
            return "UNKNOWN";
        };

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
            //console.log ("Add record (" + record.id + ") to image (" + imageId + ") - " + imageIndex[imageId].recordIds.length + " links");
        };

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
                        //console.log (id);
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

                        // de-hyphenate where the original text was wrapped
                        currentRecord.description = currentRecord.description.replace (/([^-])- /, "$1");

                        // get the title from the beginning of the description
                        let semicolon = currentRecord.description.indexOf (";");
                        if (semicolon > 0) {
                            currentRecord.title = currentRecord.description.substring (0, semicolon);
                            currentRecord.description = currentRecord.description.substring (semicolon + 1).trim ();
                        } else {
                            currentRecord.title = "UNTITLED";
                        }

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
                                    //console.log ("POSITION: " + locMatches[1]);
                                    currentRecord.position = position;

                                    // and strip the position off the end of the description
                                    currentRecord.description = currentRecord.description.replace (/;\s*[^;]+:/, "");
                                } else {
                                    //console.log ("NO POSITION FOUND (missing keywords): " + position);
                                }
                            } else {
                                //console.log ("NO POSITION FOUND (length): " + position);
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
        };

        let collectRecordIdsFromImageId = function (imageId, recordIds, imageIds) {
            if (!(imageId in touchedImageIds)) {
                //console.log ("Checking Image Id: " + imageId);
                let image = imageIds[imageId] = touchedImageIds[imageId] = imageIndex[imageId];

                // get all the records associated with this image
                for (let recordId of image.recordIds) {
                    collectImageIdsFromRecordId (recordId, recordIds, imageIds);
                }
            }
        };

        // set the target
        console.log ("Setting target");
        while (target.lastElementChild) {
            target.removeChild (target.lastElementChild);
        }

        // build the image group displays by walking over the records in their natural order
        let yearIndex = monthyear.indexOf("20");
        let year = monthyear.substring (yearIndex, yearIndex + 4);
        let month = months[archive[year].indexOf(monthyear)];
        target.appendChild (Bedrock.Html.Builder.begin ("h2", { innerHTML: month.charAt(0).toUpperCase() + month.slice(1) + " " + year }).end ());

        for (let record of records) {
            let recordIds = {};
            let imageIds = {};
            if (collectImageIdsFromRecordId (record.id, recordIds, imageIds) > 0) {
                let cluster = Bedrock.Html.Builder.begin ("div", { style: { margin: "5px 0", padding: "8px", borderWidth: "1px", borderColor: "gray", borderStyle: "solid"} });
                //console.log ("CLUSTER");

                let clusterImages = cluster.begin ("div", { style: {verticalAlign: "middle", textAlign: "center" }});
                for (let imageId of Object.keys(imageIds).sort ()) {
                    //console.log ("  Image Id: " + imageId);
                    let image = imageIndex[imageId];
                    clusterImages
                        .begin ("a", { href: image.imageUrl, target: "_blank" })
                            .begin ("img", {src: image.imageUrl, style: { borderWidth: "1px", borderStyle: "solid", borderColor: "blue", maxHeight:"140px", maxWidth: "500px", height: "auto", width: "auto", margin: "0 5px 0 0"}}).end ()
                        .end ();
                }
                clusterImages.end ();

                let clusterRecords = cluster.begin ("div").begin ("table");
                for (let recordId of Object.keys(recordIds).sort ()) {
                    //console.log ("  Record Id: " + recordId);
                    let displayRecord = recordIndex[recordId];

                    // make bullets of the description
                    let bullets = displayRecord.description.split (";");
                    let description = "<ul>";
                    for (let bullet of bullets) {
                        bullet = bullet.trim ();
                        description += "<li>" + bullet.charAt (0).toUpperCase () + bullet.slice (1) + "</li>";
                    }
                    description += "<ul>";

                    clusterRecords
                        .begin ("tr", { style: { height: "12px" } }).end ()
                        .begin ("tr", { style: { verticalAlign: "top" } })
                        .begin ("td", { style: {width: "50px"}, innerHTML: recordId }).end ()
                        .begin ("td", { style: {width: "65px"}, innerHTML: formatMoney (displayRecord.price) }).end ()
                        .begin ("td", { style: {width: "550px"} })
                            .begin ("div", { innerHTML: displayRecord.title, style: {fontWeight: "bold" } }).end ()
                            .begin ("div", { innerHTML: description }).end ()
                            .end ()
                        .begin ("td", { style: {width: "100px", fontSize: "10px", fontStyle: "italic", textAlign: "right" }, innerHTML: ("position" in displayRecord) ? displayRecord.position : "" }).end ()
                        .end ();
                }
                clusterRecords.end ().end ();
                target.appendChild (cluster.end ());
            }
        }

        // set the target
        console.log ("Finished");
        document.getElementById ("loading-div").style.display = "none";
        target.scrollIntoView ();
    });
};


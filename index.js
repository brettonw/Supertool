"use strict";

let Html = Bedrock.Html;

let main = function () {
    Bedrock.Http.get ("https://bedrock.brettonw.com/api?event=fetch&url=http://www.supertool.com/forsale/march2019list.html", function (queryResult) {
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
        content = content.replace (/<br>/gi, "\n").replace (/<\/?pre>/gi, "").replace (/&nbsp;/gi, " ").replace (/\s+\n/g, "\n");
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

        let images = {};
        let addRecordToImage = function (record, imageUrl) {
            let imageId = getImageId (imageUrl);
            if (!(imageId in images)) {
                images[imageId] = {
                    imageUrl: imageUrl,
                    records: []
                }
            }
            images[imageId].records.push (record);
        }

        // loop over all the lines...
        let records = [];
        let currentRecord = null;
        let indent;
        let lines = content.split (/\n/);
        for (let line of lines) {
            if (line.length > 0) {
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
                        currentRecord = {
                            id: id,
                            images: "",
                            price: 0,
                            description: "",
                            title: "",
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
                        currentRecord.images += "<a target=\"_blank\" href=\"" + imageUrl + "\"><img src=\"" + imageUrl + "\" style=\"height:100%;padding:3px;\"></a>";
                    }

                    // look for a price
                    matches = line.match (/\$(\d+\.\d\d)\s*$/);
                    if ((matches != null) && (matches.length > 1)) {
                        currentRecord.price = matches[1];

                        // get the title from the beginning of the description
                        let semicolon = currentRecord.description.indexOf (";");
                        if (semicolon > 0) {
                            currentRecord.title = "<div class=\"title-display-box\">" + currentRecord.description.substring (0, semicolon) + "</div>";
                        }
                        currentRecord.description = "<div class=\"title-display-box\">" + currentRecord.description.substring (semicolon) + "</div>";

                        // this finishes the record
                        records.push (currentRecord);
                        currentRecord = null;
                    }
                }

            }
        }

        console.log ("Found " + records.length + " records");

        /*

        // sort the records as an example
        let CF = Bedrock.CompareFunctions;
        records = Bedrock.DatabaseOperations.Sort.new ({ fields:[
                { name:"C", asc:true, type: CF.ALPHABETIC },
                { name:"B", asc:true, type: CF.ALPHABETIC },
                { name:"RA", asc:true, type: CF.ALPHABETIC },
                { name:"Dec", asc:true, type: CF.ALPHABETIC }
            ] }).perform (records);
        */

        // build the database filter
        Bedrock.Database.Container.new ({
            database: records,
            filterValues: [{ field: "id" }],
            onUpdate: function (db) {
                Bedrock.PagedDisplay.Table.new ({
                    container: "bedrock-database-display",
                    records: db,
                    select: [
                        { name: "id", displayName: "ID", width: 0.1 },
                        { name: "price", displayName: "Price", width: 0.1 },
                        { name: "title", displayName: "Title", width: 0.25 },
                        { name: "images", displayName: "Images", width: 0.5 }
                    ],
                    onclick: function (record) {
                        //document.getElementById("bedrock-record-display").innerHTML = show ("RA", "(RA: ") + show ("Dec", ", Dec: ") + ")" + show ("C") + show ("B", "-") + show ("N");
                        return true;
                    }
                }).makeTableWithHeader ();
            }
        });
    });
};


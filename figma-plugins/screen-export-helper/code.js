function findScreenInfos() {
    // Get all nodes directly on the page.
    const nodeInstances = figma.currentPage.findChildren(n => n.type === "INSTANCE");
    for (const node of nodeInstances) {
        // console.log('node', node.name, node.type);
        if (node.type == 'INSTANCE') {
            if (node.mainComponent.parent.name == 'Screen description') {
                // Gather details.
                // console.log('mainComponent', node.name, node.mainComponent.name, node.mainComponent.parent.name);
                gatherScreenDescriptionDetails(node);
            }
        }
    }
}
function gatherScreenDescriptionDetails(node) {
    const data = {
        id: null,
        title: null,
        links: null,
        flow: null
    };
    // Extract screen data.
    getInfoText(node, data, 'Title');
    getInfoText(node, data, 'Description');
    getInfoText(node, data, 'Flow');
    getInfoText(node, data, 'Page');
    getInfoText(node, data, 'Pagemax');
    // Find external links.
    const links = findScreenLinks(node);
    if (links.length > 0) {
        data.links = links;
    }
    // Create a unique id that's also used for the file name
    // Includes the flow to prevent duplication
    const idParts = [];
    if (data.flow) {
        idParts.push(data.flow);
    }
    idParts.push(data.title);
    data.id = slugify(idParts.join('_'));
    // Find the matching screen design node.
    findScreenDesign(node, data);
    // Clear any empty data fields.
    for (let i in data) {
        if (data[i] === null) {
            delete data[i];
        }
    }
    result.push(data);
}
// Retrieve text of a specific TextNode.
function getInfoText(node, data, childName) {
    const textNode = node.findAll(n => n.name === childName);
    if (textNode.length == 1) {
        const text = textNode[0].characters;
        // console.log('a', childName, text);
        if (text != childName) {
            data[slugify(childName)] = text;
        }
    }
}
function slugify(str) {
    str = str.replace(/^\s+|\s+$/g, ''); // trim
    str = str.toLowerCase();
    // remove accents, swap ñ for n, etc
    var from = "àáäâèéëêìíïîòóöôùúüûñç·/_,:;";
    var to = "aaaaeeeeiiiioooouuuunc------";
    for (var i = 0, l = from.length; i < l; i++) {
        str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i));
    }
    str = str.replace(/[^a-z0-9 -]/g, '') // remove invalid chars
        .replace(/\s+/g, '-') // collapse whitespace and replace by -
        .replace(/-+/g, '-'); // collapse dashes
    return str;
}
function findScreenDesign(infoNode, data) {
    // Find the matching screen design (same as title of this info instance.
    const nodes = figma.currentPage.findChildren(n => (n.name === data.title));
    let text, deltaX, deltaY, distance;
    for (const node of nodes) {
        if (!(node.type == 'INSTANCE' && node.mainComponent.parent.name == 'Screen description')) {
            // Check distance of the screen node and the info node
            // There might be nodes with the same name, so distance
            //  measurement helps identify the right one
            deltaX = node.x - infoNode.x;
            deltaY = node.y - infoNode.y;
            distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            if (distance < 1500) {
                data.screen = node;
                data.width = node.width;
                data.height = node.height;
                text = findScreenTextContent(node);
                if (text.length > 0) {
                    data.text = text;
                }
                break;
            }
        }
    }
}
// Deletes hidden children
function deleteHiddenChildren(nodeInstance) {
    let child;
    for (let i = 0; i < nodeInstance.children.length; i++) {
        child = nodeInstance.children[i];
        if (child.visible !== true) {
            // Delete invisible child.
            child.remove();
            i--;
        }
        else if (child.type == 'GROUP') {
            // If it's a group, go deeper.
            deleteHiddenChildren(child);
        }
    }
}
// Find all text nodes and grab their copy.
function findScreenTextContent(node) {
    const result = [];
    const nodes = node.findAll(n => (n.type === 'TEXT' && n.visible && n.name != 'Link'));
    const excludes = [
        '22:03',
        'Back',
        'Next',
        'space'
    ];
    let text;
    for (const node of nodes) {
        text = node.characters;
        if (text.length > 3 &&
            excludes.indexOf(text) === -1 &&
            result.indexOf(text) === -1) {
            result.push(text);
        }
    }
    return result;
}
// Find  links in an info node.
function findScreenLinks(node) {
    const result = [];
    const nodes = node.findAll(n => (n.type === 'TEXT' && n.visible && n.name == 'Link'));
    let text, link;
    for (const node of nodes) {
        text = node.characters;
        link = node.hyperlink;
        if (text && text.length > 0 && link && link.type == 'URL') {
            result.push({
                title: text,
                url: link.value
            });
        }
    }
    return result;
}
// Create a new page for storing the organized screens.
function prepareNewPage() {
    newPage = figma.createPage();
    newPage.name = "Screens for export";
    figma.root.appendChild(newPage);
    // Go to our new page.
    figma.currentPage = newPage;
}
// Prepares screen clones with the right export settings.
function duplicateScreens() {
    let item, newNode;
    for (let i = 0; i < result.length; i++) {
        item = result[i];
        if (item.screen) {
            newNode = item.screen.clone();
            newNode.name = item.id;
            newNode.cornerRadius = 40;
            newNode.x = newNodes.length % 10 * 475;
            newNode.y = Math.floor(newNodes.length / 10) * 912;
            newNode.exportSettings = [
                {
                    contentsOnly: true,
                    format: 'PNG',
                    suffix: '-preview',
                    constraint: {
                        type: 'WIDTH',
                        value: 200
                    }
                },
                {
                    contentsOnly: true,
                    format: 'PNG',
                    suffix: '-preview@2x',
                    constraint: {
                        type: 'WIDTH',
                        value: 400
                    }
                },
                {
                    contentsOnly: true,
                    format: 'PNG',
                    constraint: {
                        type: 'WIDTH',
                        value: 375
                    }
                },
                {
                    contentsOnly: true,
                    format: 'PNG',
                    suffix: '@2x',
                    constraint: {
                        type: 'WIDTH',
                        value: 750
                    }
                }
            ];
            deleteHiddenChildren(newNode);
            newPage.appendChild(newNode);
            newNodes.push(newNode);
        }
        else {
            console.log('info without a screen?', item);
        }
    }
}
// Create a text node to store JSON data.
function prepareDataOutput() {
    const textNode = figma.createText();
    textNode.x = -1100;
    textNode.y = 0;
    textNode.resize(1000, 1000);
    for (let i = 0; i < result.length; i++) {
        delete result[i].screen;
    }
    figma.loadFontAsync({ family: "Roboto", style: "Regular" }).then(() => {
        textNode.characters = JSON.stringify(result);
    });
}
function scanPages() {
    const pages = figma.root.children;
    let page, name;
    for (let i = 0; i < pages.length; i++) {
        page = pages[i];
        name = page.name;
        if (name == '-') {
            break;
        }
        else {
            scanPage(page);
        }
    }
}
function scanPage(page) {
    console.log('scanPage', page);
    figma.currentPage = page;
    findScreenInfos();
}
const result = [];
let newPage;
const newNodes = [];
scanPages();
prepareNewPage();
duplicateScreens();
prepareDataOutput();
newPage.selection = newNodes;
console.log('result', result);
// Wrap up.
figma.closePlugin();

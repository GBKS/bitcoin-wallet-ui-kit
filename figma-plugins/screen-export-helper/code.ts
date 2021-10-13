

function findScreenInfos() {
  // Get all nodes directly on the page.
  const nodeInstances = figma.currentPage.findChildren(n => n.type === "INSTANCE");

  for(const node of nodeInstances) {
    // console.log('node', node.name, node.type);

    if(node.type == 'INSTANCE') {
      if(node.mainComponent.parent.name == 'Screen description') {
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
    title: null
  };

  // Extract screen data.
  getInfoText(node, data, 'Title');
  getInfoText(node, data, 'Description');
  getInfoText(node, data, 'Flow');
  getInfoText(node, data, 'Page');
  getInfoText(node, data, 'Pagemax');

  data.id = slugify(data.title);

  findScreenDesign(data);

  result.push(data);
}

function getInfoText(node, data, childName) {
  const textNode = node.findAll(n => n.name === childName);

  if(textNode.length == 1) {
    const text = textNode[0].characters;
    // console.log('a', childName, text);
    if(text != childName) {
      data[slugify(childName)] = text;
    }
  }
}

function slugify(str) {
  str = str.replace(/^\s+|\s+$/g, ''); // trim
  str = str.toLowerCase();

  // remove accents, swap ñ for n, etc
  var from = "àáäâèéëêìíïîòóöôùúüûñç·/_,:;";
  var to   = "aaaaeeeeiiiioooouuuunc------";
  for (var i=0, l=from.length ; i<l ; i++) {
      str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i));
  }

  str = str.replace(/[^a-z0-9 -]/g, '') // remove invalid chars
      .replace(/\s+/g, '-') // collapse whitespace and replace by -
      .replace(/-+/g, '-'); // collapse dashes

  return str;
}

function findScreenDesign(data) {
  // Find the matching screen design (same as title of this info instance.
  const nodes = figma.currentPage.findChildren(n => n.name === data.title);

  for(const node of nodes) {
    // console.log('node', node.name, node.type);

    if(!(node.type == 'INSTANCE' && node.mainComponent.parent.name == 'Screen description')) {
      data.screen = node;

      data.width = node.width;
      data.height = node.height;

      data.text = findScreenTextContent(node);

      break;
    }
  }

  // console.log('data.title', data.Title);
  // console.log('a', nodes);
}

// Deletes hidden children
function deleteHiddenChildren(nodeInstance) {
  let child
  for(let i=0; i<nodeInstance.children.length; i++) {
    child = nodeInstance.children[i]

    if(child.visible !== true) {
      // Delete invisible child.
      child.remove()
      i--
    } else if(child.type == 'GROUP') {
      // If it's a group, go deeper.
      deleteHiddenChildren(child)
    }
  }
}

function findScreenTextContent(node) {
  const result = [];
  const nodes = node.findAll(n => n.type === 'TEXT');

  const excludes = [
    '22:03',
    'Back',
    'Next',
    'space'
  ]

  let text
  for(const node of nodes) {
    if(node.visible) {
      text = node.characters

      if(
        text.length > 3 && 
        excludes.indexOf(text) === -1 &&
        result.indexOf(text) === -1
      ) {
        result.push(text);
      }
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

function duplicateScreens() {
  let item, newNode;
  for(let i=0; i<result.length; i++) {
    item = result[i];

    if(item.screen) {
      newNode = item.screen.clone();

      newNode.name = item.id;
      newNode.cornerRadius = 40;

      newNode.exportSettings = [
        {
          contentsOnly: true,
          format: 'PNG',
          suffix: '-preview',
          constraint: {
            type: 'WIDTH',
            value: 250
          }
        },
        {
          contentsOnly: true,
          format: 'PNG',
          suffix: '-preview@2x',
          constraint: {
            type: 'WIDTH',
            value: 500
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
      ]

      deleteHiddenChildren(newNode)

      newPage.appendChild(newNode);
    } else {
      console.log('info without a screen?', item);    
    }
  }
}

// Create a text node to store JSON data.
function prepareDataOutput() {
  const textNode = figma.createText()
  textNode.x = 1000
  textNode.resize(1000, 1000)

  for(let i=0; i<result.length; i++) {
    delete result[i].screen
  }

  figma.loadFontAsync({ family: "Roboto", style: "Regular" }).then(() => {
    textNode.characters = JSON.stringify(result)
  })
}

const result = [];
let newPage;

findScreenInfos();
prepareNewPage();
duplicateScreens();
prepareDataOutput();

console.log('result', result);

// Wrap up.
figma.closePlugin();

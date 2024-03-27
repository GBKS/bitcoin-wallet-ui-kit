figma.showUI(__html__, {
  themeColors: true,
  width: 200,
  height: 300
})

figma.ui.onmessage = message => {
  // console.log('onmessage', message.type)
  if(message.type === 'lint') {
    let selection = figma.currentPage.selection
    let selectionType = 'user'
    if(selection.length == 0) {
      selection = figma.currentPage.children
      selectionType = 'page'
    }
    lint(selection, selectionType)
  } else if(message.type === 'select') {
    select(message.id, message.shiftKey)
  } else if(message.type === 'select-by-page-and-id') {
    selectElementByPageAndId(message.page, message.id, message.shiftKey)
  } else if(message.type === 'export') {
    exporterStart()
  } else if(message.type === 'component-insights') {
    insightsStart()
  } else if(message.type === 'apply-theme') {
    themeStart()
  } else if(message.type === 'find-instances') {
    findInstancesStart()
  }
}

async function select(id, shiftKey) {
  // console.log('select', id)
  const node = await figma.getNodeByIdAsync(id)
  if(node) {
    if(shiftKey) {
      // @ts-ignore
      figma.currentPage.selection = figma.currentPage.selection.concat(node)
      figma.viewport.scrollAndZoomIntoView(figma.currentPage.selection)
    } else {
      // @ts-ignore
      figma.currentPage.selection = [node]
      figma.viewport.scrollAndZoomIntoView([node])
    }
  } else {
    figma.ui.postMessage({
      type: 'general-message',
      message: 'Could not find this element.'
    })
  }
}

async function selectElementByPageAndId(pageName, id, shiftKey) {
  let node
  let foundNode = false

  if(figma.currentPage.name == pageName) {
    node = await figma.getNodeByIdAsync(id)
  } else {
    const pages = figma.root.children
    let page, name
    for(let i=0; i<pages.length; i++) {
      page = pages[i]
      
      if(page.name == pageName) {
        await figma.setCurrentPageAsync(page)
        node = await figma.getNodeByIdAsync(id)
        
        if(node) {
          break
        }
      }
    }
  }

  if(!!node) {
    if(shiftKey) {
      // @ts-ignore
      figma.currentPage.selection = figma.currentPage.selection.concat(node)
      figma.viewport.scrollAndZoomIntoView(figma.currentPage.selection)
    } else {
      // @ts-ignore
      figma.currentPage.selection = [node]
      figma.viewport.scrollAndZoomIntoView([node])
    }
  } else {
    figma.ui.postMessage({
      type: 'general-message',
      message: 'Could not find this element.'
    })
  }
}

// Linter - find unstyled text fields
function lint(elements, selectionType) {
  let output = []

  lintElements(elements, output)

  output = output.sort(function(a, b) {
    if(a.size > b.size) return -1
    if(a.size < b.size) return 1
    return 0
  })

  const data = {
    type: 'lint', 
    elements: output
  }

  if(output.length == 0) {
    if(selectionType == 'user') {
      data['message'] = 'No text fields without text styles were found in your selection.'
    } else {
      data['message'] = 'No text fields without text styles were found on this page.'
    }
  }

  figma.ui.postMessage(data)
}

// Recursively loop through selection and all children
function lintElements(elements:any, output:any) {
  if(!elements || elements.length == 0) return

  let i = 0, element
  for(i=0; i<elements.length; i++) {
    element = elements[i]

    if(element.type == 'TEXT' && !element.textStyleId) {
      output.push({
        id: element.id,
        text: element.characters,
        size: element.fontSize
      })
    }

    if(element.children && element.children.length > 0) {
      lintElements(element.children, output)
    }
  }
}

// Style indexer
let styles:any
async function indexStyles() {
  if(!!styles) return

  const stylesArray = await figma.getLocalPaintStylesAsync()
  styles = {}
  const stylesByName = {}
  let i = 0, style
  for(i=0; i<stylesArray.length; i++) {
    style = stylesArray[i]

    if(style.name.indexOf('Light/') === 0 || style.name.indexOf('Dark/') === 0) {
      styles[style.id] = { name: style.name }
      stylesByName[style.name] = style.id
    }
  }

  let toggledName, index
  for(let k in styles) {
    style = styles[k]

    index = style.name.indexOf('Light/')
    if(index === 0) {
      toggledName = 'Dark/' + style.name.substr(6)
      if(stylesByName[toggledName]) {
        style.toggleId = stylesByName[toggledName]
      }
    }

    index = style.name.indexOf('Dark/')
    if(index === 0) {
      toggledName = 'Light/' + style.name.substr(5)
      if(stylesByName[toggledName]) {
        style.toggleId = stylesByName[toggledName]
      }
    }
  }
  
  // console.log('styles', styles)
}

// Toggle to light or dark mode
function toggleMode(elements:any, from:String) {
  // console.log('toggleMode', elements, from)

  // Check if we have a selection
  if(!elements || elements.length == 0) return

  // Recursively loop through selection and all children
  let i = 0
  let element
  let style:any
  for(i=0; i<elements.length; i++) {
    element = elements[i]

    if(element.fillStyleId) {
      style = styles[element.fillStyleId]

      if(style && style.name.indexOf(from) === 0 && style.toggleId) {
        element.fillStyleId = style.toggleId
      }
    }

    if(element.strokeStyleId) {
      style = styles[element.strokeStyleId]

      if(style && style.name.indexOf(from) === 0 && style.toggleId) {
        element.strokeStyleId = style.toggleId
      }
    }

    if(element.children && element.children.length > 0) {
      toggleMode(element.children, from)
    }
  }
}

/*

Component insights code

 */

const insightsData = {
  nodes: 0,
  issues: 0,
  pages: []
}

let insightsCurrentPage = 0

async function insightsStart() {
  // console.log('insightsStart')

  await figma.loadAllPagesAsync()

  insightsData.nodes = 0
  insightsData.issues = 0
  insightsData.pages = []

  insightsCurrentPage = 0
  await insightsScanPages()
}

function insightsEnd() {
  figma.ui.postMessage({ 
    type: 'component-insights', 
    data: insightsData
  })
}

async function insightsScanPages() {
  // console.log('insightsScanPages', insightsCurrentPage)

  const pages = figma.root.children
  const page = pages[insightsCurrentPage]

  await insightsScanPage(page)

  insightsCurrentPage++
  if(insightsCurrentPage >= pages.length) {
    insightsEnd()
  } else {
    setTimeout(insightsScanPages, 1)
  }

  // let page
  // for(let i=0; i<pages.length; i++) {
  //   page = pages[i]
  //   await insightsScanPage(page, data)
  // }
}

async function insightsScanPage(page) {
  const data = insightsData
  // console.log('insightsScanPage', page.name)

  const nodeData = {
    name: page.name,
    instances: [],
    components: []
  }

  await figma.setCurrentPageAsync(page)

  await insightsFindComponents(figma.currentPage, nodeData, data)

  data.pages.push(nodeData)
}

async function insightsFindComponents(node, data, outputData) {
  // console.log('insightsFindComponents', node, node.children, node.name)

  let child
  for(let i=0; i<node.children.length; i++) {
    child = node.children[i]
    // console.log('---')
    // console.log('child', i, child)
    // console.log('name', child.name)
    // console.log('type', child.type)

    outputData.nodes++

    if(child.type == 'INSTANCE') {
      await insightsFindComponentsChildMainComponent(child, data, outputData)
    } else if(child.type == 'COMPONENT') {
      // console.log('compo', child.name, child.removed)
      // console.log('child.parent', child.parent)
      if(!child.parent) {
        outputData.issues++
        data.components.push({
          name: child.name,
          id: child.id,
          removed: !child.parent
        })
      }
    } else if(child.type == 'GROUP' || child.type == 'FRAME') {
      // If it's a group, go deeper.
    }

    if(child.children) {
      await insightsFindComponents(child, data, outputData)
    }
  }

  // console.log('insightsFindComponents done')
}

async function insightsFindComponentsChildMainComponent(child, data, outputData) {
  const mainComponent = await child.getMainComponentAsync() 
  // console.log('insto', child.name, childMainComponent.parent, child)
  // console.log('child.mainComponent', childMainComponent)
  // console.log('childMainComponent.remote', childMainComponent.remote)
  // console.log('childMainComponent.parent', childMainComponent.parent)
  if(mainComponent && (mainComponent.remote || !mainComponent.parent)) {
    outputData.issues++
    data.instances.push({
      name: child.name,
      id: child.id,
      main: {
        name: mainComponent.name,
        remote: mainComponent.remote,
        removed: !mainComponent.parent
      }
    })
  }
}

/*

Find instances of a component in the current selection or page

 */

async function findInstancesStart() {
  let data = null
  let message = null

  const nodes = figma.currentPage.selection
  if(nodes && nodes.length == 1) {
    const selectedNode = nodes[0]

    let nodesToCheck
    if(selectedNode.type == 'COMPONENT_SET') {
      nodesToCheck = selectedNode.children
    } else {
      nodesToCheck = [selectedNode]
    }

    let parent = selectedNode.parent
    while(parent.type !== 'PAGE' && parent.parent) {
      parent = parent.parent
    }

    data = {
      name: selectedNode.name,
      id: selectedNode.id,
      page: parent.name,
      instances: []
    }

    let i=0, k, instance, node, nodeInstances
    for(; i<nodesToCheck.length; i++) {
      node = nodesToCheck[i]

      if(node.type == 'COMPONENT') {
        nodeInstances = await node.getInstancesAsync()
        if(nodeInstances && nodeInstances.length > 0) {
          for(k=0; k<nodeInstances.length; k++) {
            instance = nodeInstances[k]

            parent = instance.parent
            while(parent.type !== 'PAGE' && parent.parent) {
              parent = parent.parent
            }

            data.instances.push({
              id: instance.id,
              page: parent.name,
              name: instance.name
            })
          }
        }
      }
    }
  } else {
    message = 'Make sure to select a component (variant).'
  }

  figma.ui.postMessage({
    type: 'find-instances',
    data,
    message
  })
}

/*

Screen export stuff below

 */

const exporter = {
  result: [],
  newPage: null,
  newNodes: []
}

function exporterFindSelectedScreenInfos() {
  // Get all selected nodes.
  const nodes = figma.currentPage.selection

  for(const node of nodes) {
    // console.log('node', node.name, node.type)

    if(node.type == 'INSTANCE') {
      if(node.mainComponent.parent.name == 'Screen description') {
        // Gather details.
        // console.log('mainComponent', node.name, node.mainComponent.name, node.mainComponent.parent.name);
        exporterGatherScreenDescriptionDetails(node)
      }
    }
  }
}

function exporterFindScreenInfos() {
  // Get all nodes directly on the page.
  // console.log('findScreenInfos', figma.currentPage);
  const nodeInstances = figma.currentPage.findChildren(n => n.type === "INSTANCE")

  // console.log('nodeInstances', nodeInstances)

  for(const node of nodeInstances) {
    // console.log('node', node)
    // console.log('name', node.name)
    // console.log('type', node.type)

    if(node.type == 'INSTANCE') {
      // console.log('type is instance')
      // console.log('mainComponent', node.mainComponent)
      // console.log('node.mainComponent.parent', node.mainComponent.parent)

      if(node.mainComponent.parent.name == 'Screen description') {

        // Gather details.
        // console.log('mainComponent', node.name, node.mainComponent.name, node.mainComponent.parent.name);
        exporterGatherScreenDescriptionDetails(node)
      }
    }
  }
}

function exporterGatherScreenDescriptionDetails(node) {
  const data = {
    id: null,
    title: null,
    links: null,
    flow: null
  }

  // Extract screen data.
  exporterGetInfoText(node, data, 'Title')
  exporterGetInfoText(node, data, 'Description')
  exporterGetInfoText(node, data, 'Flow')
  exporterGetInfoText(node, data, 'Page')
  exporterGetInfoText(node, data, 'Pagemax')

  // Find external links.
  const links = exporterFindScreenLinks(node)
  if(links.length > 0) {
    data.links = links
  }

  // Create a unique id that's also used for the file name
  // Includes the flow to prevent duplication
  const idParts = []
  if(data.flow) {
    idParts.push(data.flow)
  }
  idParts.push(data.title)
  data.id = exporterSlugify(idParts.join('_'))

  // Find the matching screen design node.
  exporterFindScreenDesign(node, data)

  // Clear any empty data fields.
  for(let i in data) {
    if(data[i] === null) {
      delete data[i]
    }
  }

  exporter.result.push(data);
}

// Retrieve text of a specific TextNode.
function exporterGetInfoText(node, data, childName) {
  const textNode = node.findAll(n => n.name === childName)

  if(textNode.length == 1) {
    const text = textNode[0].characters
    // console.log('a', childName, text)
    if(text != childName) {
      data[exporterSlugify(childName)] = text
    }
  }
}

function exporterSlugify(str) {
  str = str.replace(/^\s+|\s+$/g, '') // trim
  str = str.toLowerCase()

  // remove accents, swap ñ for n, etc
  var from = "àáäâèéëêìíïîòóöôùúüûñç·/_,:;"
  var to   = "aaaaeeeeiiiioooouuuunc------"
  for (var i=0, l=from.length ; i<l ; i++) {
      str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i))
  }

  str = str.replace(/[^a-z0-9 -]/g, '') // remove invalid chars
      .replace(/\s+/g, '-') // collapse whitespace and replace by -
      .replace(/-+/g, '-') // collapse dashes

  return str;
}

function exporterFindScreenDesign(infoNode, data) {
  // Find the matching screen design (same as title of this info instance.
  const nodes = figma.currentPage.findChildren(n => (n.name === data.title))

  let text, deltaX, deltaY, distance
  for(const node of nodes) {
    if(!(node.type == 'INSTANCE' && node.mainComponent.parent.name == 'Screen description')) {
      // Check distance of the screen node and the info node
      // There might be nodes with the same name, so distance
      //  measurement helps identify the right one
      deltaX = node.x - infoNode.x
      deltaY = node.y - infoNode.y
      distance = Math.sqrt(deltaX*deltaX + deltaY*deltaY)

      if(distance < 1500) {
        data.screen = node

        data.width = node.width
        data.height = node.height

        text = exporterFindScreenTextContent(node)
        if(text.length > 0) {
          data.text = text
        }

        break;
      }
    }
  }
}

// Deletes hidden children
function exporterDeleteHiddenChildren(nodeInstance) {
  let child
  for(let i=0; i<nodeInstance.children.length; i++) {
    child = nodeInstance.children[i]

    if(child.visible !== true) {
      // Delete invisible child.
      child.remove()
      i--
    } else if(child.type == 'GROUP') {
      // If it's a group, go deeper.
      exporterDeleteHiddenChildren(child)
    }
  }
}

// Find all text nodes and grab their copy.
function exporterFindScreenTextContent(node) {
  const result = [];
  const nodes = node.findAll(n => (n.type === 'TEXT' && n.visible && n.name != 'Link'))

  const excludes = [
    '22:03',
    'Back',
    'Next',
    'space'
  ]

  let text
  for(const node of nodes) {
    text = node.characters

    if(
      text.length > 3 && 
      excludes.indexOf(text) === -1 &&
      result.indexOf(text) === -1
    ) {
      result.push(text)
    }
  }

  return result
}

// Find  links in an info node.
function exporterFindScreenLinks(node) {
  const result = []
  const nodes = node.findAll(n => (n.type === 'TEXT' && n.visible && n.name == 'Link'))

  let text, link
  for(const node of nodes) {
    text = node.characters
    link = node.hyperlink

    if(text && text.length > 0 && link && link.type == 'URL') {
      result.push({
        title: text,
        url: link.value
      })
    }
  }

  return result;
}

// Create a new page for storing the organized screens.
async function exporterPrepareNewPage() {
  exporter.newPage = figma.createPage()
  exporter.newPage.name = "Screens for export"
  figma.root.appendChild(exporter.newPage)

  // Go to our new page.
  figma.setCurrentPageAsync(exporter.newPage)
}

// Prepares screen clones with the right export settings.
function exporterDuplicateScreens() {
  let item, newNode
  for(let i=0; i<exporter.result.length; i++) {
    item = exporter.result[i]

    if(item.screen) {
      newNode = item.screen.clone()

      newNode.name = item.id
      newNode.cornerRadius = 40
      newNode.x = exporter.newNodes.length%10 * 475
      newNode.y = Math.floor(exporter.newNodes.length / 10) * 912

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
      ]

      exporterDeleteHiddenChildren(newNode)

      exporter.newPage.appendChild(newNode)

      exporter.newNodes.push(newNode)
    } else {
      console.log('info without a screen?', item);   
    }
  }
}

// Create a text node to store JSON data.
function exporterPrepareDataOutput() {
  const textNode = figma.createText()
  textNode.x = -1100
  textNode.y = 0
  textNode.resize(1000, 1000)

  for(let i=0; i<exporter.result.length; i++) {
    delete exporter.result[i].screen
  }

  figma.loadFontAsync({ family: "Inter", style: "Regular" }).then(() => {
    textNode.fontName = {
      family: 'Inter',
      style: 'Regular'
    }
    textNode.characters = JSON.stringify(exporter.result)
  })
}

async function exporterScanPages() {
  const pages = figma.root.children
  let page, name
  for(let i=0; i<pages.length; i++) {
    page = pages[i]
    name = page.name

    if(name == '-') {
      break
    } else {
      await exporterScanPage(page)
    }
  }
}

async function exporterScanPage(page) {
  // console.log('scanPage', page)

  await figma.setCurrentPageAsync(page)

  await figma.currentPage.loadAsync()

  exporterFindScreenInfos()
}

async function exporterStart() {
  // console.log('exporterStart')

  await figma.loadAllPagesAsync()

  exporter.result = []
  exporter.newPage = null
  exporter.newNodes = []

  if(figma.currentPage.selection && figma.currentPage.selection.length > 0) {
    // Go over nodes the user has selected
    exporterFindSelectedScreenInfos()
  } else {
    // Scan all pages for screens.
    await exporterScanPages()
  }

  if(exporter.result.length > 0) {
    await exporterPrepareNewPage()
    exporterDuplicateScreens()
    exporterPrepareDataOutput()

    exporter.newPage.selection = exporter.newNodes
  }
}

/*

Theming

 */

let themeUpdatePageModeData = null

async function themeStart() {
  await figma.loadAllPagesAsync()

  const data = themeFindData()
  // console.log('theme', data)
  if(data) {
    let i=0, item
    for(i=0; i<data.length; i++) {
      item = data[i]
      if(item.Colors) await themeUpdateColors(item.Colors)
      if(item.TextStyles) await themeUpdateTextStyles(item.TextStyles)
      if(item.Components) await themeUpdateComponents(item.Components)
      if(item.Variables) await themeUpdateVariables(item.Variables)
      if(item.Background) await themeUpdateBackground(item.Background)
      if(item.Mode) await themeUpdateMode(item.Mode)
    }
  } else {
    const nodes = figma.currentPage.selection
    let message = 'No style information was found in the selected elements.'
    if(nodes.length == 0) {
      message = 'Select a theme frame (🎨) and try again.'

      // Navigate to the themes page.
      const pages = figma.root.children
      for(let i=0; i<pages.length; i++) {
        if(pages[i].name == 'Themes') {
          await figma.setCurrentPageAsync(pages[i])
          break
        }
      }
    }

    figma.ui.postMessage({
      type: 'apply-theme',
      message
    })
  }
}

function themeUpdateBackground(background) {
  const paint = figma['util'].solidPaint(background)
  const pages = figma.root.children
  for(let i=0; i<pages.length; i++) {
    pages[i].backgrounds = [paint]
  }
}

function themeUpdateMode(mode) {
  indexStyles()

  const newMode = mode == 'Dark' ? 'Light/' : 'Dark/'
  themeUpdatePageModeData = {
    index: 0,
    mode: newMode
  }

  themeUpdatePageMode()
}

function themeUpdatePageMode() {
  const pages = figma.root.children
  
  const message = 'Updating page '+(themeUpdatePageModeData.index+1)+' of '+pages.length+'.'
  figma.ui.postMessage({
    type: 'general-message',
    message
  })

  const page = pages[themeUpdatePageModeData.index]
  toggleMode(page.children, themeUpdatePageModeData.mode)

  if(themeUpdatePageModeData.index < (pages.length-1)) {
    themeUpdatePageModeData.index ++
    setTimeout(themeUpdatePageMode.bind(this), 250)
  }
}

// Extract JSON theme data from the currently selected text field
function themeFindData() {
  let result = null

  const nodes = figma.currentPage.selection

  let i, node, k, childNodes, childNode, data, text
  for(i=0; i<nodes.length; i++) {
    node = nodes[i]
    childNodes = node.findAllWithCriteria({ types: ['TEXT'] })
    // console.log('childNodes', childNodes)

    for(k=0; k<childNodes.length; k++) {
      childNode = childNodes[k]
      text = childNode.characters
      text = text.split('“').join('"')
      text = text.split('”').join('"')

      try {
        data = JSON.parse(text)
        if(!result) result = []
        result.push(data)
      } catch(error) {
        // console.log('JSON parsing error', error)
      }
    }
  }

  return result
}

async function themeUpdateColors(data) {
  // console.log('updateColors', data)

  // Index all local color styles
  const styles = await figma.getLocalPaintStylesAsync()
  const styleNames = {}
  for(let i=0; i<styles.length; i++) {
    styles[styles[i].name] = styles[i].id
  }
  // console.log('styles', styles)

  let styleName, styleId, style, props, paint
  for(styleName in data) {
    styleId = styles[styleName]
    style = await figma.getStyleByIdAsync(styleId)
    // console.log('styleName', styleName)
    // console.log('styleId', styleId)
    // console.log('style', style)

    if(style) {
      props = data[styleName]
      // console.log('props', props)
      // console.log('paints', style.paints)

      if(style.paints.length > 0) {
        paint = style.paints[0]
        // console.log('paints', paint, paint.type)
        if(paint.type == 'SOLID') {
          const updated = figma['util'].solidPaint(props, style.paints[0])
          style.paints = [updated]
          // console.log('updated', updated)
        }
        
      }
    }
  }
}

async function themeUpdateTextStyles(data) {
  // console.log('updateTextStyles', data)

  // Index all local text styles
  const styles = await figma.getLocalTextStylesAsync()
  const styleNames = {}
  for(let i=0; i<styles.length; i++) {
    styles[styles[i].name] = styles[i].id
  }

  let styleName, styleId
  for(styleName in data) {
    styleId = styles[styleName]
    let style
    style = await figma.getStyleByIdAsync(styleId)

    if(style) {
      const props = data[styleName]
      const fontName = {
        family: style.fontName.family,
        style: style.fontName.style
      }

      if(props.family) fontName.family = props.family
      if(props.style) fontName.style = props.style

      // Need to load both the current and the new font for adjusting settings.
      figma.loadFontAsync(style.fontName).then(() => {
        figma.loadFontAsync(fontName).then(() => {
          style.fontName = fontName

          if(props.size) style.fontSize = props.size
          if(props.letterSpacing) style.letterSpacing = props.letterSpacing
          if(props.case) style.textCase = props.case

          if(props.lineHeight) {
            if(props.lineHeight.indexOf('%') === -1) {
              style.lineHeight = { 
                value: parseInt(props.lineHeight), 
                unit: 'PIXELS' 
              }
            } else {
              style.lineHeight = { 
                value: parseInt(props.lineHeight.substr(0, props.lineHeight.length-1)), 
                unit: 'PERCENT' 
              }
            }
            // console.log('l', style.lineHeight)
          }
        })
      })
    }
  }
}

function themeUpdateComponents(data) {
  // console.log('updateComponents', data)

  // Index all local components
  const pages = figma.root.children
  const componentNames = {}
  let i=0, k, components, component
  for(; i<pages.length; i++) {
    components = pages[i].findAllWithCriteria({
      types: ['COMPONENT', 'COMPONENT_SET']
    })
    // console.log('pages[i]', pages[i])
    // console.log('components', components)

    for(k=0; k<components.length; k++) {
      component = components[k]

      if(component.type == "COMPONENT") {
        componentNames[component.name] = component.id
      } else if(component.type == "COMPONENT_SET") {
        // console.log('component', component)
        componentNames[component.parent.name+'/'+component.name] = component.id
      }
      
    }
  }
  // console.log('componentNames', componentNames)
  return

  let componentName, nodes
  for(componentName in data) {
    // Search all pages for this component

    nodes = figma.currentPage.findAllWithCriteria({
      types: ['COMPONENT', 'COMPONENT_SET']
    })
  }
}

async function themeUpdateVariables(data) {
  // console.log('updateVariables', data)

  // Index all local variables
  const variables = await figma.variables.getLocalVariablesAsync()
  const variableNames = {}
  for(let i=0; i<variables.length; i++) {
    variableNames[variables[i].name] = variables[i].id
  }

  // Get our current mode
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  const modeId = collections[0].defaultModeId

  let variableName, variableId, variable, props
  for(variableName in data) {
    variableId = variableNames[variableName]
    variable = await figma.variables.getVariableByIdAsync(variableId)

    if(variable) {
      variable.setValueForMode(modeId, data[variableName])
    }
  }
}

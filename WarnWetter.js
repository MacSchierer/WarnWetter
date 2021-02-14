// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: exclamation-triangle;
//
// Script für https://scriptable.app
// WarnWetter -  Ein Scriptable Widget für iOS und Mac
// Das Widget zeigt regionale Warnmeldungen des Deutschen Wetterdienstes (DWD) an. 
// Verwendbar als kleines, mittleres oder großes (empfohlen!) Widget.
//
// Script by MacSchierer, 14.02.2021, v1.6
// Download der aktuellen Version hier: GitHub https://github.com/MacSchierer/WarnWetter
// 
// Verwendet die bereitgestellte JSONP-File vom DWD
// https://www.dwd.de/DE/wetter/warnungen_aktuell/objekt_einbindung/objekteinbindung.html
// Warncell-IDs: https://www.dwd.de/DE/leistungen/opendata/help/warnungen/cap_warncellids_csv.html 
// Wetter allgemein: https://www.dwd.de/DWD/wetter/wv_allg/deutschland/text/vhdl13_dwog.html
//
// Die Auswahl der Region (Bezug auf Landkreis) kann über die Vorgabe der Warncell-ID als Widgetparameter erfolgen.
// Eine Tabelle mit den notwendigen IDs wird angezeigt, wenn das Skript in der Scriptable App ausgeführt wird.
// Wird keine Warncell-ID dem Widget vorgegeben, wird via GPS die Region ermittelt und es wird versucht die
// zugehörige ID zu ermitteln
//
//
const debug = false
config.widgetFamily = config.widgetFamily || 'large'
// Zeit für die Warncell-IDs im Cache
const cacheMinutes = 7 * 24 * 60  // 1 Woche = 10080 Minuten
//
// Ab hier nichts ändern
//
const APIurl = "https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json"
const CSVurl = "https://www.dwd.de/DE/leistungen/opendata/help/warnungen/cap_warncellids_csv.csv?__blob=publicationFile&v=3"
const today = new Date()
let hasError = false
let ErrorTxt = ""  
let WarnCell = ""
let useGPS = false
let df = new DateFormatter()
	df.useMediumDateStyle()
	df.useShortTimeStyle()
// Fraben definieren
const BGGradient = new LinearGradient()
	  BGGradient.locations = [0.0,1]
	  BGGradient.colors = [Color.dynamic(new Color("#6180c4"), new Color("#000000")), Color.dynamic(new Color("#344b96"), new Color("#222222"))] 	
const WidgetBgColor = Color.dynamic(new Color("#ffffff"), new Color("#000000"))	
const ContentBGColor = Color.dynamic(new Color("#efefef20"), new Color("#ffffff20"))	
const MainTextColor = Color.dynamic(new Color("#ffffff"), new Color("#ffffff"))
const SubTextColor = Color.dynamic(new Color("#d4dcf7"), new Color("#aaaaaa"))
const IconColor = MainTextColor
const TitelColor = MainTextColor

// Warncell-IDs im Cache
WarnCellData = await manageCache()
if (WarnCellData) {
	WarnCellData = JSON.parse(WarnCellData)
} else {
	hasError = true
	ErrorTxt += "Benötigte WarnCell-IDs konnten nicht verarbeitet werden. " 
}
// Skript wird in Scriptable ausgeführt --> Zeigt Liste der Warncell-IDs aus der (lokalen) JSON-Datei generiert
if (config.runsInApp && debug == false) {
	const webView = new WebView()
	TableContent = await loadTable(WarnCellData)
	const cssStyles = "body{padding:1em;font-family: Courier;font-size:2em;}table{width:100%;font-size:0.8em;margin:0 auto;text-align:center;border-collapse:collapse;border:1px solid #d4d4d4;}tr:nth-child(even){background:#d4dcf7;}th,td{padding:10px 30px;}th{border-bottom:1px solid #d4d4d4;background:#6180c4;color:#fff;}"
	const HTMLHeadElement = "<head><style type='text/css'>" + cssStyles + "</style></head>"
	const webHtml = HTMLHeadElement+ "<body bgcolor='white'><h1>Warncell-IDs des DWD</h1><p>Hier findest du die Warncell-IDs der zur Verfügung stehenden Regionen. Eine einzelne ID kann optional in den Parameter des Widgets eingetragen werden. Ohne Parameter versucht das Widget, der über GPS ermittelten Region, eine Warncell-ID zuzuordnen.<p><div>"+TableContent+"</div></body>"
	await webView.loadHTML(webHtml)
	await webView.present()
	Script.complete()
	return
}
// Widgetparameter oder GPS benutzen?
if (config.runsInWidget && debug == false) {
		WarnCell = args.widgetParameter
	}
if (WarnCell == null || WarnCell.toString().length == 0) {
	try {
		const loc = await getGPS()  
		let GPSData = await Location.reverseGeocode(loc.latitude, loc.longitude)
		// Daten von Apples Geocoding Service
		MyCity = GPSData[0].postalAddress.city
		MyArea = GPSData[0].postalAddress.subAdministrativeArea
		useGPS = true 
		log("GPS wird verwenden...")
		log("Ort: " + MyCity)
		log("Region: " + MyArea)		
	} catch(e) { 
		console.warn(e) 
		useGPS = false  
		hasError = true
		ErrorTxt += "GPS Problem...\n" 
	}
} else {
	MyArea = WarnCellData[WarnCell].NAME
}
// JSON vom DWD abrufen
try {
	AllItems = await loadItems(APIurl)
} catch (e) {
	hasError = true
	ErrorTxt += "Das Widget konnte keine Daten abrufen. " 
}
// Wenn GPS verwendet wird, über die Region die Warncell-ID ermitteln
if (useGPS) {
	WarnCell = getWarnCellID(WarnCellData, MyArea)
	log("WarncellID: " + WarnCell)
}
// Prüfen ob Warncell-ID existiert - Wichtig bei GPS ermittelter Region
if (WarnCellData.hasOwnProperty(WarnCell) == false) {
	log(WarnCell + " wurde nicht gefunden!")
	hasError = true
	ErrorTxt += "Die Region wurde aktuell nicht erkannt.\nSollte das Problem weiterhin bestehen, starte das Skript einmal kurz in der App. Dort erhältst du auch eine Übersicht der Regionen und weitere Infos. "  
} else {
	// Wenn Warncell-ID vorhanden ist, kann die "Auswertung" starten	
	try {
		CellWarnings = AllItems.warnings[WarnCell.toString()]
		WarnAnz = CellWarnings.length
		log(WarnAnz + " Meldung(en) gefunden")
		WarnLocation = new Array()
		WarnLevel = new Array()
		WarnEvent = new Array()
		WarnShort = new Array()
		WarnStartDate = new Array()
		WarnEndeDate = new Array()
		WarnDescription = new Array()
		WarnInstruction = new Array()
		if (CellWarnings.length > 0) {
			var i;
			for (i = 0; i < CellWarnings.length; i++) { 
				WarnLocation.push(CellWarnings[i].regionName)
				WarnLevel.push(CellWarnings[i].level)
				WarnEvent.push(CellWarnings[i].event)
				WarnShort.push(CellWarnings[i].headline) 
				WarnStartDate.push(new Date(CellWarnings[i].start))
				WarnEndeDate.push(new Date(CellWarnings[i].end))
				WarnDescription.push(CellWarnings[i].description)
				WarnInstruction.push(CellWarnings[i].instruction)
			}
			WarnIntro = WarnLocation[0]
			WarnOutput = true	
		} else {
			if (useGPS) {
				WarnIntro = MyArea + ": Keine Warnung aktiv."
			}
			WarnIcon = "checkmark.seal"
			WarnOutput = false
		}
	} catch (e) {
		hasError = true
		ErrorTxt += "Beim Verarbeiten der Daten ist ein Fehler aufgetreten." 
	}
}	

class WarnWidget {
	async init() {
		const widget = await this.createWidget()
		switch (config.widgetFamily) {
			case 'small': await widget.presentSmall(); break;
			case 'medium': await widget.presentMedium(); break;
			case 'large': await widget.presentLarge(); break;
		}	
		Script.setWidget(widget)
		Script.complete()
	}
	async createWidget() {
		if (hasError) {return ErrorWidget(ErrorTxt)}
		const list = new ListWidget()
		      list.backgroundGradient = BGGradient	
			  list.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000) // 60 Minuten Refresh-Intervall
		let ScaleFactor = 1
		let MaxWarn = 1
		switch (config.widgetFamily) {
			case 'small': 
				list.setPadding(10, 5, 10, 5)
				ScaleFactor = 0.5
				break;
			case 'medium': 
				list.setPadding(10, 10, 5, 10)
				break;
			case 'large': 
				list.setPadding(15, 10, 15, 10)
				MaxWarn = 3
				break;
		}
		if (useGPS) {
			list.url = "https://www.dwd.de/DE/wetter/warnungen_landkreise/warnWetter_node.html?ort="+SonderToURL(MyCity)
		} else {
			list.url = "https://www.dwd.de/DE/wetter/warnungen_landkreise/warnWetter_node.html"
		}
		const Title = list.addStack()  
		let TitleText = Title.addText("Wetterwarnung des DWD")
			TitleText.textColor = TitelColor
			TitleText.font = Font.boldSystemFont(14)
			TitleText.lineLimit = 1
			TitleText.minimumScaleFactor = ScaleFactor
		if (config.widgetFamily != 'small') {
			Title.addSpacer()	
			let DateText = Title.addDate(new Date(AllItems.time))
				DateText.textColor = SubTextColor
				DateText.applyDateStyle()
				DateText.font = Font.boldSystemFont(8)	
		}			
		const SubTitle = list.addStack()  
		SubTitle.setPadding(0, 4, 0, 4)
		if (useGPS) {
			addSymbol({
				  symbol: 'mappin.and.ellipse',
				  stack: SubTitle,
				  color: SubTextColor,
				  size: 10,
			})
			SubTitle.addSpacer(4)			
		}
		let SubTitleText = SubTitle.addText(WarnIntro)
			SubTitleText.font = Font.systemFont(10)
			SubTitleText.textColor = SubTextColor
			SubTitleText.lineLimit = 1
			SubTitleText.minimumScaleFactor = ScaleFactor
		list.addSpacer(2)	
		const Content = list.addStack() 
		Content.setPadding(2,2,2,2)
		Content.layoutVertically()
		if (WarnOutput == true) {
			for (i = 0; i < WarnAnz; i++) {  
				if (i == MaxWarn) {break;}			
				if (i != 0) {Content.addSpacer(8)}
				const WarnStack = Content.addStack() 
					WarnStack.layoutVertically()
					WarnStack.backgroundColor = ContentBGColor		
					WarnStack.cornerRadius = 4
					WarnStack.setPadding(4,4,4,4)
					const WarnStackHeader = WarnStack.addStack() 
					WarnStackHeader.layoutHorizontally()
						const WarnStackIcon = WarnStackHeader.addStack()
						WarnStackIcon.setPadding(2,2,2,2)
						WarnStackIcon.cornerRadius = 2
						WarnStackIcon.backgroundColor = getWarnLevelColor(WarnLevel[i])	
						addSymbol({
							  symbol: getWarnIcon(WarnEvent[i]),
							  stack: WarnStackIcon,
							  color: IconColor,
							  size: 24,
						})
						const WarnStackHead = WarnStackHeader.addStack() 
						WarnStackHead.layoutVertically()
						WarnStackHead.setPadding(0,6,0,0)
							const WarnStackTitle = WarnStackHead.addStack() 
								WarnStackTitle.centerAlignContent()
								let WarnTitleText = WarnStackTitle.addText(WarnEvent[i])
									WarnTitleText.textColor = MainTextColor
									WarnTitleText.font = Font.boldSystemFont(14)
									WarnTitleText.lineLimit = 1
									WarnTitleText.minimumScaleFactor = ScaleFactor
							WarnStackTitle.addSpacer()
							if (config.widgetFamily != 'small') {
								const WarnStackLevel = WarnStackTitle.addStack()
								WarnStackLevel.backgroundColor = getWarnLevelColor(WarnLevel[i])	
								WarnStackLevel.setPadding(0,2,0,2)
								WarnStackLevel.cornerRadius = 2
								WarnStackLevel.centerAlignContent()
									let WarnLevelText = WarnStackLevel.addText("Stufe " + WarnLevel[i])
									WarnLevelText.textColor = MainTextColor
									WarnLevelText.font = Font.systemFont(12)
									WarnLevelText.lineLimit = 1
									WarnLevelText.minimumScaleFactor = ScaleFactor							
								const WarnStackTime = WarnStackHead.addStack()
									let WarnTimeText = WarnStackTime.addText(df.string(WarnStartDate[i]) + " Uhr bis " + df.string(WarnEndeDate[i]) + " Uhr")
										WarnTimeText.textColor = SubTextColor
										WarnTimeText.font = Font.systemFont(10)
								WarnStackTime.addSpacer()
							}
				WarnStack.addSpacer(4)
					const WarnStackInfo = WarnStack.addStack()
					WarnStackInfo.layoutHorizontally()
					WarnStackInfo.setPadding(0,4,0,4)
						let InfoText = WarnStackInfo.addText(WarnDescription[i].replace(/\n\n/g, " "))
							InfoText.textColor = MainTextColor
							InfoText.font = Font.systemFont(12)
							InfoText.minimumScaleFactor = ScaleFactor
							InfoText.lineLimit = 4
					WarnStackInfo.addSpacer()
				WarnStack.addSpacer(4)
			}
			Content.addSpacer()
			// Info über Anzahl der angezeigten und verfügbaren Meldungen
			if (config.widgetFamily != 'small') {
				SubTitle.addSpacer()
				let WarnAnzText
					if (WarnAnz > MaxWarn) {
						WarnAnzText = i + " von " + WarnAnz + " aktiven Meldungen"
					} else if (WarnAnz == 1) {
						WarnAnzText = "Eine Meldung aktiv"
					} else {
						WarnAnzText = WarnAnz + " aktive Meldungen"
					}
					let AnzWarn = SubTitle.addText(WarnAnzText) 
					AnzWarn.textColor = SubTextColor
					AnzWarn.font = Font.systemFont(8)		
			}
		}
		if (WarnOutput == false || i <= 2 && config.widgetFamily == 'large') {
			const WarnStack = Content.addStack() 
				WarnStack.layoutVertically()
				WarnStack.backgroundColor = ContentBGColor		
				WarnStack.cornerRadius = 4
				WarnStack.setPadding(4,4,4,4)	
				const WarnStackTitle = WarnStack.addStack() 
				let WarnTitleText = WarnStackTitle.addText("Allgemeine Meldung")
					WarnTitleText.textColor = MainTextColor
					WarnTitleText.font = Font.boldSystemFont(14)
					WarnTitleText.lineLimit = 1
				const WarnStackInfo = WarnStack.addStack()
				WarnStackInfo.layoutHorizontally()
				WarnStackInfo.setPadding(0,4,0,4)
				let InfoText = WarnStackInfo.addText(await loadHTMLContent("https://www.dwd.de/DWD/wetter/wv_allg/deutschland/text/vhdl13_dwog.html"))
					InfoText.textColor = MainTextColor
					InfoText.font = Font.systemFont(12)
					InfoText.minimumScaleFactor = ScaleFactor
					InfoText.lineLimit = 8
				WarnStackInfo.addSpacer()
			WarnStack.addSpacer()				
		}
		list.addSpacer()	
		return list
	}
// Class Ende
}

//
// Error Widget
function ErrorWidget(reason) {
	const error = new ListWidget()
	error.setPadding(10,10,10,10)
	error.backgroundGradient = BGGradient
	let title = error.addText("Information")
		title.centerAlignText()
		title.textColor = SubTextColor
		title.font = Font.semiboldSystemFont(24)
		let reasonText = error.addText(reason)
			reasonText.centerAlignText()
			reasonText.textColor = MainTextColor
			reasonText.font = Font.semiboldSystemFont(12)
			reasonText.minimumScaleFactor = 0.7
	error.addSpacer()
  return error	
}
//
// JSON vom DWD abrufen
async function loadItems(APIurl) {
	let req = new Request(APIurl)
	req.headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36'}
	let jsonp = await req.loadString()
	cut1 = ("warnWetter.loadWarnings(").length 
	cut2 = (");").length 
	json = JSON.parse(jsonp.slice(cut1, -cut2))
	return json
}
//
// Cache - Lokale-JSON-Datei mit den WarncellIDs erstellen und speichern
async function manageCache() {
	const files = FileManager.local()
	const cachePath = files.joinPath(files.cacheDirectory(), "warncellids.json")
	const cacheExists = files.fileExists(cachePath)
	const cacheDate = cacheExists ? files.modificationDate(cachePath) : 0
	let WarnCellData
	let lastUpdate
	try {
	  if (cacheExists && (today.getTime() - cacheDate.getTime()) < (cacheMinutes * 60 * 1000)) {
		console.log("Lokale JSON-Datei laden")
		WarnCellData = files.readString(cachePath)
		lastUpdate = cacheDate
	  } else {
		console.log("CSV-Datei extern abrufen") 
		req = new Request(CSVurl)
		RawData = await req.loadString()
		WarnCellData = await CSVToJSON(RawData)
		lastUpdate = today
		console.log("CSV-Datei als JSON lokal abspeichern")
		try {
		  files.writeString(cachePath, (WarnCellData))
		  
		} catch (e) {
		  console.log("Fehler beim Speichern der JSON-Datei")
		  console.log(e)
		}
	  }
	} catch (e) {
	  console.error(e)
	  if (cacheExists) {
		console.log("Lokale JSON-Datei laden")
		WarnCellData = files.readString(cachePath)
		lastUpdate = cacheDate
	  } else {
		console.log("Fehler beim Speichen/Laden der JSON-Datei")
	  }
	}
	return WarnCellData
}
//
// Erstell die Tabelle der Regionen, alphabetisch sortiert
async function loadTable(WarnCells) {
	let WorkArray = {}
	for (WarnCell in WarnCells) {
		key = WarnCells[WarnCell].NAME
		key = key.replace("Kreis ", "")
		key = key.replace("Stadt ", "")
		WorkArray[key] = WarnCell
	}
	let SortArray = {}
	Object.keys(WorkArray).sort().map(i=>SortArray[i]=WorkArray[i])
	let table = '<table><thead><tr><th>Region</th><th>Warncell-ID</th></tr></thead>'
	for (WarnRegion in SortArray) {
		table += '<tr><td>' + WarnRegion + '</td><td>' + SortArray[WarnRegion] + '</td></tr>'
	}
	table += '</table>'	
	log("HTML-Tabelle erstellt")  
	return table
}
//
// Verarbeiten der CSV mit den Warncell-IDs
async function CSVToJSON(csvData) {
	var data = await CSVToArray(csvData)
	var ParentObj = {}
	var ChildObj = []
	for (var i = 1; i < data.length; i++) {
		ChildObj[i - 1] = {}
		for (var k = 0; k < data[0].length && k < data[i].length; k++) {
			var key = data[0][k]
			ChildObj[i - 1][key] = data[i][k]
		}
		if (ChildObj[i - 1]["WARNCELLID"] > 200000000) {
			break
		}
		else {
			ParentObj[data[i][0]] = ChildObj[i - 1]
		}
	}
	var jsonData = JSON.stringify(ParentObj)
	jsonData = jsonData.replace(/},/g, "},\r\n")
	return jsonData
}
//
//
// Verarbeiten der CSV mit den Warncell-IDs Hilfsfunktion
async function CSVToArray(csvData, delimiter) {
	delimiter = (delimiter || ";")
	 var pattern = new RegExp((
	"(\\" + delimiter + "|\\r?\\n|\\r|^)" +
	"(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +
	"([^\"\\" + delimiter + "\\r\\n]*))"), "gi")
	var data = [[]]
	var matches = null
	while (matches = pattern.exec(csvData.replace("# ",""))) {
		var matchedDelimiter = matches[1]
		if (matchedDelimiter.length && (matchedDelimiter != delimiter)) {
			data.push([])
		}
		if (matches[2]) {
			var matchedDelimiter = matches[2].replace(
			new RegExp("\"\"", "g"), "\"")
		} else {
			var matchedDelimiter = matches[3]
		}
		data[data.length - 1].push(matchedDelimiter)
	}
	return (data)
}
//
// Wenn keine Warnungen vorhanden sind, wird die allgemeine Wetterlage vom HTML geparst
async function loadHTMLContent(HTMLurl) {
	let HTMLView = new WebView()
	await HTMLView.loadURL(HTMLurl)
	let js = `
	document
	  .getElementById("wettertext")
	  .getElementsByTagName("pre")[0]
	  .textContent
	`
	let HTMContent = await HTMLView.evaluateJavaScript(js)
	return HTMContent
}
//
// GPS Details abrufen (3km Radius, Dienst (reverseGeocode) von Apple Karten)
async function getGPS() {
	try {
		Location.setAccuracyToThreeKilometers()
		return await Location.current()
	} catch (e) {
		logError(e)
		return null	
	}
}

function getWarnCellID(Haystack, Needle) {
	for (var key in Haystack) {
		Region = Haystack[key].NAME
		let myReg = new RegExp(Needle + ".*")
		let myMatch = Region.match(myReg)
		if (myMatch) {
			result = key
			break
		} else {
			result = "emty"
		}
	}
	return result
}
//
// Icon den verschiedenen Warnarten zuordnen
function getWarnIcon(WarnTag){
	WarnTag = WarnTag.toLowerCase()
	WarnWind = ["windböen", "sturmböen", "schwere sturmböen",]
	WarnSturm = ["orkanartige böen", "orkanböen", "extreme orkanböen"]
	WarnGwitter = ["gewitter", "starkes gewitter", "schwere gewitter", "extremes gewitter"]
	WarnRegen = ["starkregen", "heftiger starkregen", "extrem heftiger starkregen", "dauerregen", "ergiebiger dauerregen", "extrem ergiebiger dauerregen"]
	WarnSchnee = ["leichter schneefall", "schneefall", "starker schneefall", "extrem starker schneefall"]
	WarnSchneeWind = ["schneeverwehung", "starke schneeverwehung", "extrem starke schneeverwehung"]
	WarnGlatt = ["glätte", "örtlich glatteis", "glatteis"]
	WarnFrost = ["frost", "strenger frost"]
	WarnNebel = ["nebel"]
	WarnTau = ["tauwetter", "starkes tauwetter"]
	WarnHitze = ["starke wärmebelastung", "extreme wärmebelastung"]
	WarnUV = ["erhöhte uv-intensität"]	
	if (WarnWind.includes(WarnTag)) {WarnIcon = "wind"}
	else if (WarnSturm.includes(WarnTag)) {WarnIcon = "tornado"}
	else if (WarnGwitter.includes(WarnTag)) {WarnIcon = "cloud.bolt"}
	else if (WarnRegen.includes(WarnTag)) {WarnIcon = "cloud.heavyrain"}
	else if (WarnSchnee.includes(WarnTag)) {WarnIcon = "cloud.snow"}
	else if (WarnSchneeWind.includes(WarnTag)) {WarnIcon = "wind.snow"}
	else if (WarnGlatt.includes(WarnTag)) {WarnIcon = "snow"}
	else if (WarnFrost.includes(WarnTag)) {WarnIcon = "thermometer.snowflake"}
	else if (WarnNebel.includes(WarnTag)) {WarnIcon = "cloud.fog"}	
	else if (WarnTau.includes(WarnTag)) {WarnIcon = "aqi.low"}	
	else if (WarnHitze.includes(WarnTag)) {WarnIcon = "thermometer.sun"}	
	else if (WarnHitze.includes(WarnTag)) {WarnIcon = "sun.max.fill"}	
	else {WarnIcon = "exclamationmark.triangle"}		
	return WarnIcon
}
//
// Icon für Warnstufen (akutell nicht in verwendung)
function getWarnLevelIcon(Level){
	if (Level == 1) {LevelIcon = "1.square"}
	else if (Level == 2) {LevelIcon = "2.square"}
	else if (Level == 3) {LevelIcon = "3.square"}
	else if (Level == 4) {LevelIcon = "4.square"}
	else {LevelIcon = "exclamationmark.circle"}
	return LevelIcon
}
//
// Farben für Warnstufen 
function getWarnLevelColor(Level){
	if (Level == 1) {LevelColor = new Color("#fbea60")}
	else if (Level == 2) {LevelColor = new Color("#ea9037")}
	else if (Level == 3) {LevelColor = new Color("#d04b40")}
	else if (Level == 4) {LevelColor = new Color("#7a254f")}
	else if (Level == 0) {LevelColor = new Color("#cbe277")}
	return LevelColor
}
//
// SF Smbole
function addSymbol({
	  symbol = 'applelogo',
	  stack,
	  color = Color.white(),
	  size = 20,
	  imageOpacity = 1,
	}) {
	  const _sym = SFSymbol.named(symbol)
	  const wImg = stack.addImage(_sym.image)
	  wImg.tintColor = color
	  wImg.imageSize = new Size(size, size)
	  wImg.containerRelativeShape = false
	  wImg.imageOpacity = imageOpacity
	}
//
// Umlaute und Sonderzeichen für URL optimieren
function SonderToURL(value){
	value = value.toLowerCase();
	value = value.replace(/ä/g, '%C3%A4')
	value = value.replace(/ö/g, '%C3%B6')
	value = value.replace(/ü/g, '%C3%BC')
	value = value.replace(/ß/g, '%C3%9F')
	value = value.replace(/ /g, '%20')
	return value
}

await new WarnWidget().init()
// End of Script

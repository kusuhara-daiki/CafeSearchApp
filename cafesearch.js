var YAHOO_APP_ID = PropertiesService.getScriptProperties().getProperty('YAHOO_APP_ID'); // [プロジェクトのプロパティ] > [スクリプトのプロパティ] で設定
var LINE_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_TOKEN'); // [プロジェクトのプロパティ] > [スクリプトのプロパティ] で設定

var LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
var YAHOO_SEARCH_URL = 'https://map.yahooapis.jp/search/local/V1/localSearch';
var YAHOO_DIST_URL = 'https://map.yahooapis.jp/dist/V1/distance';

function getDistanceInKilloMeters(latitude1, longitude1, latitude2, longitude2) {
  var url = YAHOO_DIST_URL
          + '?appid=' + YAHOO_APP_ID
          + '&coordinates=' + longitude1 + ',' + latitude1 + encodeURIComponent(' ') + longitude2 + ',' + latitude2
          + '&output=json';
  var response = UrlFetchApp.fetch(url);
  var distance = JSON.parse(response.getContentText('UTF-8'))['Feature'][0]['Geometry'].Distance;
  return Math.round(distance * 10) / 10;
}

function getGoogleSearchUrl(query) {
  return 'https://www.google.co.jp/search?q=' + encodeURIComponent(query) + '&ie=UTF-8';
}

function getGoogleMapRouteUrl(srcLatitude, srcLongitude, destLatitude, destLongitude) {
  return 'http://maps.google.com/maps'
         + '?saddr=' + srcLatitude + ',' + srcLongitude
         + '&daddr=' + destLatitude + ',' + destLongitude
         + '&dirflg=w';
}

var Cafe = function(uid, name, address, distance, googleSearchUrl, googleMapRouteUrl) {
  this.uid = uid;
  this.name = name;
  this.address = address;
  this.distance = distance;
  this.googleSearchUrl = googleSearchUrl;
  this.googleMapRouteUrl = googleMapRouteUrl;
};
function getNearCafes(latitude, lonitude) {
  var url = YAHOO_SEARCH_URL
          + '?appid=' + YAHOO_APP_ID
          + '&dist=3'     // 3 km 以内
          + '&gc=0115001' // 業種コード:　カフェ
          + '&results=5'  // 最大 5 件
          + '&lat=' + latitude
          + '&lon=' + lonitude
          + '&output=json&sort=dist';
  var response = UrlFetchApp.fetch(url);
  
  var cafes = [];
  var features = JSON.parse(response.getContentText('UTF-8'))['Feature'];
  for (i = 0; i < features.length; i++) {
    var uid = features[i]['Property'].Uid;
    var name = features[i].Name;
    var address = features[i]['Property'].Address;
    var coords = features[i]['Geometry'].Coordinates.split(',');
    var cafe_lonitude = coords[0];
    var cafe_latitude = coords[1];
    var distance = getDistanceInKilloMeters(cafe_latitude, cafe_lonitude, latitude, lonitude);
    var googleSearchUrl = getGoogleSearchUrl(name + ' ' + address);
    var googleMapRouteUrl = getGoogleMapRouteUrl(cafe_latitude, cafe_lonitude, latitude, lonitude);
    cafes.push(new Cafe(uid, name, address, distance, googleSearchUrl, googleMapRouteUrl));
  }
  return cafes;
}

function doPost(e) {
  var json = JSON.parse(e.postData.contents);  

  // var userId = json.events[0].source.userId;

  var replyToken= json.events[0].replyToken;
  if (typeof replyToken === 'undefined') {
    return;
  }
  
  var helpMessage = 'こんにちは。近くのカフェをお知らせするLINEbotです。\n\n'
                  + '位置情報を送信すると、3 km 以内のカフェを、最大 5 つ探して次の情報をお伝えします。\n\n'
                  + '・カフェの名前\n'
                  + '・直線距離\n'
                  + '・住所\n'
                  + '・検索リンク\n'
                  + '・ルート案内リンク\n\n'
                  + '※位置情報は、トークルーム下部の「＋」→「位置情報」から送信できます。';
  var messages = [{'type': 'text', 'text': helpMessage}]; 

  if ('message' == json.events[0].type) {
  
    var userMessage = json.events[0].message;
    if ('location' == json.events[0].message.type) {
      var replyMessage = getNearCafes(userMessage.latitude, userMessage.longitude);
      var columns = replyMessage.map(function (v) {
        var title = v.name;
        // var postbackLabel = '行ったことがある';
        // var postbackData = 'action=visited&uid=' + v.uid;
        // if (isVisited(v.uid, userId)) {
        //   title += ' (★訪問済み)'
        //   postbackLabel = '訪問済み を取り消す';
        //   postbackData = 'action=unvisited&uid=' + v.uid;
        // }
        return {
          'title': title,
          'text': 'ここから ' + v.distance + 'km ― ' + v.address,
          'actions': [
            // {
            //   'type': 'postback',
            //   'label': postbackLabel,
            //   'data': postbackData
            // },
            {
              'type': 'uri',
              'label': 'このカフェを検索',
              'uri': v.googleSearchUrl
            },
            {
              'type': 'uri',
              'label': 'ここからのルート',
              'uri': v.googleMapRouteUrl
            }
          ]
        };
    });
    var altText = '';
    replyMessage.forEach(function(element, index, array) {
      altText += element.name + ' | ';
    });
    messages = [
      {
        'type': 'template',
        'altText': altText,
        'template': {
          'type': 'carousel',
          'columns': columns
        }
      }
    ];
    }
  
  }

  UrlFetchApp.fetch(LINE_REPLY_URL, {
    'headers': {
      'Content-Type': 'application/json; charset=UTF-8',
      'Authorization': 'Bearer ' + LINE_TOKEN,
    },
    'method': 'post',
    'payload': JSON.stringify({
      'replyToken': replyToken,
      'messages': messages,
    }),
  });
  return ContentService.createTextOutput(JSON.stringify({'content': 'post ok'})).setMimeType(ContentService.MimeType.JSON);
}
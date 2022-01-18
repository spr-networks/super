/*!

=========================================================
* Paper Dashboard PRO React - v1.3.0
=========================================================

* Product Page: https://www.creative-tim.com/product/paper-dashboard-pro-react
* Copyright 2021 Creative Tim (https://www.creative-tim.com)

* Coded by Creative Tim

=========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

*/
const icons = [
  {
    name: "nc-icon nc-air-baloon",
    content: "\\ea01",
  },
  {
    name: "nc-icon nc-album-2",
    content: "\\ea02",
  },
  {
    name: "nc-icon nc-alert-circle-i",
    content: "\\ea04",
  },
  {
    name: "nc-icon nc-align-center",
    content: "\\ea03",
  },
  {
    name: "nc-icon nc-align-left-2",
    content: "\\ea05",
  },
  {
    name: "nc-icon nc-ambulance",
    content: "\\ea06",
  },
  {
    name: "nc-icon nc-app",
    content: "\\ea07",
  },
  {
    name: "nc-icon nc-atom",
    content: "\\ea08",
  },
  {
    name: "nc-icon nc-badge",
    content: "\\ea09",
  },
  {
    name: "nc-icon nc-bag-16",
    content: "\\ea0a",
  },
  {
    name: "nc-icon nc-bank",
    content: "\\ea0b",
  },
  {
    name: "nc-icon nc-basket",
    content: "\\ea0c",
  },
  {
    name: "nc-icon nc-bell-55",
    content: "\\ea0d",
  },
  {
    name: "nc-icon nc-bold",
    content: "\\ea0e",
  },
  {
    name: "nc-icon nc-book-bookmark",
    content: "\\ea0f",
  },
  {
    name: "nc-icon nc-bookmark-2",
    content: "\\ea10",
  },
  {
    name: "nc-icon nc-box-2",
    content: "\\ea11",
  },
  {
    name: "nc-icon nc-box",
    content: "\\ea12",
  },
  {
    name: "nc-icon nc-briefcase-24",
    content: "\\ea13",
  },
  {
    name: "nc-icon nc-bulb-63",
    content: "\\ea14",
  },
  {
    name: "nc-icon nc-bullet-list-67",
    content: "\\ea15",
  },
  {
    name: "nc-icon nc-bus-front-12",
    content: "\\ea16",
  },
  {
    name: "nc-icon nc-button-pause",
    content: "\\ea17",
  },
  {
    name: "nc-icon nc-button-play",
    content: "\\ea18",
  },
  {
    name: "nc-icon nc-button-power",
    content: "\\ea19",
  },
  {
    name: "nc-icon nc-calendar-60",
    content: "\\ea1a",
  },
  {
    name: "nc-icon nc-camera-compact",
    content: "\\ea1b",
  },
  {
    name: "nc-icon nc-caps-small",
    content: "\\ea1c",
  },
  {
    name: "nc-icon nc-cart-simple",
    content: "\\ea1d",
  },
  {
    name: "nc-icon nc-chart-bar-32",
    content: "\\ea1e",
  },
  {
    name: "nc-icon nc-chart-pie-36",
    content: "\\ea1f",
  },
  {
    name: "nc-icon nc-chat-33",
    content: "\\ea20",
  },
  {
    name: "nc-icon nc-check-2",
    content: "\\ea21",
  },
  {
    name: "nc-icon nc-circle-10",
    content: "\\ea22",
  },
  {
    name: "nc-icon nc-cloud-download-93",
    content: "\\ea23",
  },
  {
    name: "nc-icon nc-cloud-upload-94",
    content: "\\ea24",
  },
  {
    name: "nc-icon nc-compass-05",
    content: "\\ea25",
  },
  {
    name: "nc-icon nc-controller-modern",
    content: "\\ea26",
  },
  {
    name: "nc-icon nc-credit-card",
    content: "\\ea27",
  },
  {
    name: "nc-icon nc-delivery-fast",
    content: "\\ea28",
  },
  {
    name: "nc-icon nc-diamond",
    content: "\\ea29",
  },
  {
    name: "nc-icon nc-email-85",
    content: "\\ea2a",
  },
  {
    name: "nc-icon nc-favourite-28",
    content: "\\ea2b",
  },
  {
    name: "nc-icon nc-glasses-2",
    content: "\\ea2c",
  },
  {
    name: "nc-icon nc-globe-2",
    content: "\\ea2d",
  },
  {
    name: "nc-icon nc-globe",
    content: "\\ea2e",
  },
  {
    name: "nc-icon nc-hat-3",
    content: "\\ea2f",
  },
  {
    name: "nc-icon nc-headphones",
    content: "\\ea30",
  },
  {
    name: "nc-icon nc-html5",
    content: "\\ea31",
  },
  {
    name: "nc-icon nc-image",
    content: "\\ea32",
  },
  {
    name: "nc-icon nc-istanbul",
    content: "\\ea33",
  },
  {
    name: "nc-icon nc-key-25",
    content: "\\ea34",
  },
  {
    name: "nc-icon nc-laptop",
    content: "\\ea35",
  },
  {
    name: "nc-icon nc-layout-11",
    content: "\\ea36",
  },
  {
    name: "nc-icon nc-lock-circle-open",
    content: "\\ea37",
  },
  {
    name: "nc-icon nc-map-big",
    content: "\\ea38",
  },
  {
    name: "nc-icon nc-minimal-down",
    content: "\\ea39",
  },
  {
    name: "nc-icon nc-minimal-left",
    content: "\\ea3a",
  },
  {
    name: "nc-icon nc-minimal-right",
    content: "\\ea3b",
  },
  {
    name: "nc-icon nc-minimal-up",
    content: "\\ea3c",
  },
  {
    name: "nc-icon nc-mobile",
    content: "\\ea3d",
  },
  {
    name: "nc-icon nc-money-coins",
    content: "\\ea3e",
  },
  {
    name: "nc-icon nc-note-03",
    content: "\\ea3f",
  },
  {
    name: "nc-icon nc-palette",
    content: "\\ea40",
  },
  {
    name: "nc-icon nc-paper",
    content: "\\ea41",
  },
  {
    name: "nc-icon nc-pin-3",
    content: "\\ea42",
  },
  {
    name: "nc-icon nc-planet",
    content: "\\ea43",
  },
  {
    name: "nc-icon nc-refresh-69",
    content: "\\ea44",
  },
  {
    name: "nc-icon nc-ruler-pencil",
    content: "\\ea45",
  },
  {
    name: "nc-icon nc-satisfied",
    content: "\\ea46",
  },
  {
    name: "nc-icon nc-scissors",
    content: "\\ea47",
  },
  {
    name: "nc-icon nc-send",
    content: "\\ea48",
  },
  {
    name: "nc-icon nc-settings-gear-65",
    content: "\\ea49",
  },
  {
    name: "nc-icon nc-settings",
    content: "\\ea4a",
  },
  {
    name: "nc-icon nc-share-66",
    content: "\\ea4b",
  },
  {
    name: "nc-icon nc-shop",
    content: "\\ea4c",
  },
  {
    name: "nc-icon nc-simple-add",
    content: "\\ea4d",
  },
  {
    name: "nc-icon nc-simple-delete",
    content: "\\ea4e",
  },
  {
    name: "nc-icon nc-simple-remove",
    content: "\\ea4f",
  },
  {
    name: "nc-icon nc-single-02",
    content: "\\ea50",
  },
  {
    name: "nc-icon nc-single-copy-04",
    content: "\\ea51",
  },
  {
    name: "nc-icon nc-sound-wave",
    content: "\\ea52",
  },
  {
    name: "nc-icon nc-spaceship",
    content: "\\ea53",
  },
  {
    name: "nc-icon nc-sun-fog-29",
    content: "\\ea54",
  },
  {
    name: "nc-icon nc-support-17",
    content: "\\ea55",
  },
  {
    name: "nc-icon nc-tablet-2",
    content: "\\ea56",
  },
  {
    name: "nc-icon nc-tag-content",
    content: "\\ea57",
  },
  {
    name: "nc-icon nc-tap-01",
    content: "\\ea58",
  },
  {
    name: "nc-icon nc-tie-bow",
    content: "\\ea59",
  },
  {
    name: "nc-icon nc-tile-56",
    content: "\\ea5a",
  },
  {
    name: "nc-icon nc-time-alarm",
    content: "\\ea5b",
  },
  {
    name: "nc-icon nc-touch-id",
    content: "\\ea5c",
  },
  {
    name: "nc-icon nc-trophy",
    content: "\\ea5d",
  },
  {
    name: "nc-icon nc-tv-2",
    content: "\\ea5e",
  },
  {
    name: "nc-icon nc-umbrella-13",
    content: "\\ea5f",
  },
  {
    name: "nc-icon nc-user-run",
    content: "\\ea60",
  },
  {
    name: "nc-icon nc-vector",
    content: "\\ea61",
  },
  {
    name: "nc-icon nc-watch-time",
    content: "\\ea62",
  },
  {
    name: "nc-icon nc-world-2",
    content: "\\ea63",
  },
  {
    name: "nc-icon nc-zoom-split",
    content: "\\ea64",
  },
];

export default icons;

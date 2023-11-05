// Ensure you've included the AWS SDK for JavaScript in the Browser
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

class GalleryManager {
  #s3Config = {
    signatureVersion: "v4",
  };
  #s3Client;

  constructor(endpoint, region, bucketName) {
    this.#s3Config.endpoint = endpoint;
    this.#s3Config.region = region;
    this.#s3Config.bucketName = bucketName;

    this.initialized = this.initialize();
  }

  async initialize() {
    try {
      //Retrieve metadata via fetch
      this.metadata = await fetch(
        `${this.#s3Config.endpoint}/${this.#s3Config.bucketName}/metadata.json`,
      );
    } catch (err) {
      this.metadata = {
        latestIndex: 0,
        createdOn: Date.now(),
      };
    }
  }

  async login(key, secret, username, iconURL) {
    this.#s3Config.credentials = {
      accessKeyId: key,
      secretAccessKey: secret,
    };
    this.#s3Client = new S3Client(this.#s3Config);

    try {
      debugger;
      const params = {
          Bucket: this.#s3Config.bucketName,
          Key: "metadata.json",
        },
        command = new GetObjectCommand(params),
        data = await this.#s3Client.send(command);

      //Save Login Information in Browser
      const cred = new PasswordCredential({
        id: key,
        password: secret,
        name: username,
        iconURL: iconURL,
      });
      await navigator.credentials.store(cred);

      return data.Body.toString();
    } catch (error) {
      console.error("Error logging in:", error);
      throw error;
    }
  }

  logout() {
    //TODO: Clear Login Info from Browser and Refresh
  }

  async create(photo, caption) {
    this.metadata.latestIndex++;
    const photoKey = `/posts/${this.metadata.latestIndex}/photo.${photo.name
        .split(".")
        .pop()}`,
      captionKey = `/posts/${this.metadata.latestIndex}/caption.md`,
      metadataKey = `/metadata.json`,
      tasks = [
        new Upload({
          client: this.#s3Client,
          params: {
            ACL: "public-read",
            Bucket: this.#s3Config.bucketName,
            Key: photoKey,
            Body: photo,
          },
          tags: [], // optional tags
          queueSize: 4, // optional concurrency configuration
          partSize: 1024 * 1024 * 5, // optional size of each part, in bytes, at least 5MB
          leavePartsOnError: false, // optional manually handle dropped parts
        }),
        new Upload({
          client: this.#s3Client,
          params: {
            ACL: "public-read",
            Bucket: this.#s3Config.bucketName,
            Key: captionKey,
            Body: caption,
          },
          tags: [], // optional tags
          queueSize: 4, // optional concurrency configuration
          partSize: 1024 * 1024 * 5, // optional size of each part, in bytes, at least 5MB
          leavePartsOnError: false, // optional manually handle dropped parts
        }),
        new Upload({
          client: this.#s3Client,
          params: {
            ACL: "public-read",
            Bucket: this.#s3Config.bucketName,
            Key: metadataKey,
            Body: this.metadata,
          },
          tags: [], // optional tags
          queueSize: 4, // optional concurrency configuration
          partSize: 1024 * 1024 * 5, // optional size of each part, in bytes, at least 5MB
          leavePartsOnError: false, // optional manually handle dropped parts
        }),
      ];

    try {
      await Promise.all(tasks);
    } catch (error) {
      console.error("Error uploading:", error);
      throw error;
    }
  }

  async update(index, { photo, caption }) {
    try {
      let tasks = [];
      if (photo) {
        const photoKey = `/posts/${index}/photo.png`;
        tasks.push(
          new Upload({
            client: this.#s3Client,
            params: {
              ACL: "public-read",
              Bucket: this.#s3Config.bucketName,
              Key: photoKey,
              Body: photo,
            },
            tags: [], // optional tags
            queueSize: 4, // optional concurrency configuration
            partSize: 1024 * 1024 * 5, // optional size of each part, in bytes, at least 5MB
            leavePartsOnError: false, // optional manually handle dropped parts
          }),
        );
      }
      if (caption) {
        const captionKey = `/posts/${index}/caption.md`;
        tasks.push(
          new Upload({
            client: this.#s3Client,
            params: {
              ACL: "public-read",
              Bucket: this.#s3Config.bucketName,
              Key: captionKey,
              Body: caption,
            },
            tags: [], // optional tags
            queueSize: 4, // optional concurrency configuration
            partSize: 1024 * 1024 * 5, // optional size of each part, in bytes, at least 5MB
            leavePartsOnError: false, // optional manually handle dropped parts
          }),
        );
      }
      await Promise.all(tasks);
    } catch (error) {
      console.error("Error updating:", error);
      throw error;
    }
  }

  async delete(index) {
    try {
      const listParams = {
          Bucket: this.#s3Config.bucketName,
          Prefix: `/posts/${index}/`,
        },
        listCommand = new ListObjectsCommand(listParams),
        listedObjects = await this.#s3Client.send(listCommand);

      if (listedObjects.Contents.length === 0) return;

      const deleteParams = {
        Bucket: this.#s3Config.bucketName,
        Delete: { Objects: [] },
      };

      listedObjects.Contents.forEach(({ Key }) => {
        deleteParams.Delete.Objects.push({ Key });
      });

      const deleteCommand = new DeleteObjectsCommand(deleteParams);
      await this.#s3Client.send(deleteCommand);

      if (listedObjects.IsTruncated) await this.delete(index);
    } catch (error) {
      console.error("Error deleting files:", error);
      throw error;
    }
  }

  async list(length = 100, startIndex = 0) {
    try {
      const postsPrefix = `/posts/`,
        listParams = {
          Bucket: this.#s3Config.bucketName,
          Prefix: postsPrefix,
          MaxKeys: length,
          Marker: `${postsPrefix}${startIndex}/`,
        },
        listCommand = new ListObjectsCommand(listParams),
        listedObjects = await this.#s3Client.send(listCommand),
        postIndexes = new Set();

      listedObjects.Contents.forEach(({ Key }) => {
        const match = Key.match(/\/posts\/(\d+)\//);
        if (match) postIndexes.add(parseInt(match[1], 10));
      });

      return [...postIndexes];
    } catch (error) {
      console.error("Error listing posts:", error);
      throw error;
    }
  }
}

const s3endpoint = `s3.filebase.com`,
  s3bucket = `w3gallery-jason-cors`,
  galleryEndpoint = `https://${s3bucket}.${s3endpoint}`,
  galleryBioRequest = fetch(`${galleryEndpoint}/bio.md`),
  galleryManager = new GalleryManager(
    `https://${s3endpoint}`,
    "us-east-1",
    s3bucket,
  );

async function initGallery() {
  await galleryManager.initialized;
  //Populate Profile Photo
  setImageSrc("gallery-profile", `${galleryEndpoint}/profile.png`);
  //Populate Title
  const galleryTitleDiv = document.getElementById("gallery-title"),
    galleryBioDiv = document.getElementById("gallery-bio"),
    galleryMetadataRequest = fetch(`${galleryEndpoint}/metadata.json`),
    galleryMetadata = await (await galleryMetadataRequest).json();
  let galleryIndexCount = galleryMetadata.latestIndex;
  galleryTitleDiv.innerHTML = galleryMetadata.name;
  //Populate Bio
  galleryBioDiv.innerHTML = await (await galleryBioRequest).text();
  //Populate Images
  let galleryIndexToFetch = 1,
    appendImageTasks = [];
  while (galleryIndexCount > 0) {
    appendImageTasks.push(appendImage(galleryIndexToFetch));
    galleryIndexCount--;
    galleryIndexToFetch++;
  }
  await Promise.all(appendImageTasks);
}

async function initLogin() {
  await galleryManager.initialized;
  await waitForElm("#gallery-login");
  //Catch Login Submit
  const loginForm = document.getElementById("gallery-login");

  // Add an event listener for the 'submit' event
  loginForm.addEventListener("submit", async function (event) {
    // Prevent the default form submission
    event.preventDefault();

    // Get the values of the username and password inputs
    const key = document.getElementById("floatingInput").value,
      secret = document.getElementById("floatingPassword").value;

    await login(key, secret);
  });
}

async function initCreate() {
  await galleryManager.initialized;
}

function setImageSrc(divId, src) {
  const img = document.getElementById(divId);
  img.src = src;
}

async function login(key, secret) {
  await galleryManager.initialized;
  const galleryMetadataRequest = fetch(`${galleryEndpoint}/metadata.json`),
    galleryMetadata = await (await galleryMetadataRequest).json(),
    galleryUsername =
      typeof galleryMetadata.firstName !== "undefined"
        ? `${galleryMetadata.firstName || ""} ${galleryMetadata.lastName || ""}`
        : galleryMetadata.name;
  return await galleryManager.login(
    key,
    secret,
    galleryUsername.trim(),
    `${galleryEndpoint}/profile.png`,
  );
}

async function appendImage(index) {
  const galleryContainer = document.getElementById("gallery-album"),
    imageEndpoint = `${galleryEndpoint}/posts/${index}/photo.jpg`,
    imageCaptionRequest = fetch(`${galleryEndpoint}/posts/${index}/caption.md`),
    imageCaption = await (await imageCaptionRequest).text(),
    imageHTML = `<div class="col">
                <div id="gallery-image-${index}" class="card shadow-sm">
                    <img class="bd-placeholder-img card-img-top img-fluid img-thumbnail"  role="img" aria-label="Placeholder: Thumbnail" src="${imageEndpoint}" alt="${imageCaption}">
                    <div class="card-body">
                        <p class="card-text">${imageCaption}</p>
                        <div class="btn-group btn-block col-12 d-none">
                            <button type="button" class="btn btn-sm btn-outline-secondary">Edit</button>
                            <button type="button" class="btn btn-sm btn-outline-secondary">Delete</button>
                        </div>
                    </div>
                </div>
            </div>`;
  galleryContainer.innerHTML += imageHTML;
}

async function setup() {
  debugger;
  const currentURL = window.location.href;
  if (currentURL.indexOf("login") !== -1) {
    if (document.readyState === "complete") {
      initLogin().then((r) => {
        console.log(`Login Initialized`);
      });
    } else {
      document.addEventListener("DOMContentLoaded", function (event) {
        initLogin().then((r) => {
          console.log(`Login Initialized`);
        });
      });
    }
  } else if (currentURL.indexOf("create") !== -1) {
    await waitForElm("#gallery-login");
    if (document.readyState === "complete") {
      initCreate().then((r) => {
        console.log(`Login Initialized`);
      });
    } else {
      document.addEventListener("DOMContentLoaded", function (event) {
        initCreate().then((r) => {
          console.log(`Login Initialized`);
        });
      });
    }
  } else {
    await waitForElm("#gallery-profile");
    if (document.readyState === "complete") {
      initGallery().then((r) => {
        console.log(`Gallery Initialized`);
      });
    } else {
      document.addEventListener("DOMContentLoaded", function (event) {
        initGallery().then((r) => {
          console.log(`Gallery Initialized`);
        });
      });
    }
  }
}

window.addEventListener("hashchange", function (event) {
  setup();
});
setup();

const route = (event) => {
  debugger;
  event = event || window.event;
  event.preventDefault();
  window.history.pushState({}, "", event.target.href);
  handleLocation();
  setup();
};

const routes = {
  404: "/pages/404.html",
  "/": "/pages/index.html",
  "/login": "/pages/login.html",
  "/create": "/pages/create.html",
};

const handleLocation = async () => {
  const path = window.location.pathname;
  const route = routes[path] || routes[404];
  const html = await fetch(route).then((data) => data.text());
  document.getElementById("main-page").innerHTML = html;
};

window.onpopstate = handleLocation;
window.route = route;

handleLocation();

function waitForElm(selector) {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver((mutations) => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}

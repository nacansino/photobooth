/*
 * preview-stream: Streams camera preview frames and handles captures.
 *
 * Uses libgphoto2 directly to keep the PTP session open.
 *
 * Protocol:
 *   stdout (binary):
 *     Preview frame: [0x01][4-byte BE length][JPEG data]
 *     Capture OK:    [0x02][4-byte BE path length][path string]
 *     Capture fail:  [0x03][0x00 0x00 0x00 0x00]
 *
 *   stdin (text):
 *     "capture /path/to/output.jpg\n" - trigger full-res capture
 *
 * Handles SIGTERM to cleanly close the camera session and release USB.
 *
 * Build: gcc -O2 -o preview-stream preview-stream.c $(pkg-config --cflags --libs libgphoto2) -lpthread
 */

#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <string.h>
#include <unistd.h>
#include <stdint.h>
#include <fcntl.h>
#include <errno.h>
#include <gphoto2/gphoto2.h>

#define MSG_PREVIEW 0x01
#define MSG_CAPTURE_OK 0x02
#define MSG_CAPTURE_FAIL 0x03

static volatile sig_atomic_t running = 1;

static void handle_signal(int sig) {
    (void)sig;
    running = 0;
}

static void write_uint32_be(uint8_t *buf, uint32_t val) {
    buf[0] = (val >> 24) & 0xff;
    buf[1] = (val >> 16) & 0xff;
    buf[2] = (val >> 8) & 0xff;
    buf[3] = val & 0xff;
}

static int send_preview_frame(Camera *camera, GPContext *context) {
    CameraFile *file = NULL;
    int ret;

    ret = gp_file_new(&file);
    if (ret != GP_OK) return -1;

    ret = gp_camera_capture_preview(camera, file, context);
    if (ret != GP_OK) {
        gp_file_free(file);
        return -1;
    }

    const char *data = NULL;
    unsigned long size = 0;
    ret = gp_file_get_data_and_size(file, &data, &size);
    if (ret == GP_OK && size > 0) {
        uint8_t header[5];
        header[0] = MSG_PREVIEW;
        write_uint32_be(header + 1, (uint32_t)size);

        if (fwrite(header, 1, 5, stdout) != 5 ||
            fwrite(data, 1, size, stdout) != size) {
            gp_file_free(file);
            return -2;  /* stdout closed */
        }
        fflush(stdout);
    }

    gp_file_free(file);
    return 0;
}

static void trigger_autofocus(Camera *camera, GPContext *context) {
    CameraWidget *widget = NULL, *child = NULL;
    int ret;

    ret = gp_camera_get_config(camera, &widget, context);
    if (ret != GP_OK) return;

    ret = gp_widget_get_child_by_name(widget, "autofocusdrive", &child);
    if (ret == GP_OK) {
        int one = 1;
        gp_widget_set_value(child, &one);
        gp_camera_set_config(camera, widget, context);
        /* Give AF time to lock */
        usleep(500000);
    }
    gp_widget_free(widget);
}

static void do_capture(Camera *camera, GPContext *context, const char *output_path) {
    CameraFile *file = NULL;
    CameraFilePath camera_path;
    int ret;

    fprintf(stderr, "preview-stream: capturing to %s\n", output_path);

    /* Autofocus before capture */
    trigger_autofocus(camera, context);

    ret = gp_camera_capture(camera, GP_CAPTURE_IMAGE, &camera_path, context);
    if (ret != GP_OK) {
        fprintf(stderr, "preview-stream: capture failed: %s\n", gp_result_as_string(ret));
        uint8_t header[5] = { MSG_CAPTURE_FAIL, 0, 0, 0, 0 };
        fwrite(header, 1, 5, stdout);
        fflush(stdout);
        return;
    }

    ret = gp_file_new(&file);
    if (ret != GP_OK) {
        uint8_t header[5] = { MSG_CAPTURE_FAIL, 0, 0, 0, 0 };
        fwrite(header, 1, 5, stdout);
        fflush(stdout);
        return;
    }

    ret = gp_camera_file_get(camera, camera_path.folder, camera_path.name,
                              GP_FILE_TYPE_NORMAL, file, context);
    if (ret != GP_OK) {
        fprintf(stderr, "preview-stream: download failed: %s\n", gp_result_as_string(ret));
        gp_file_free(file);
        uint8_t header[5] = { MSG_CAPTURE_FAIL, 0, 0, 0, 0 };
        fwrite(header, 1, 5, stdout);
        fflush(stdout);
        return;
    }

    ret = gp_file_save(file, output_path);
    gp_file_free(file);

    /* Delete from camera */
    gp_camera_file_delete(camera, camera_path.folder, camera_path.name, context);

    if (ret != GP_OK) {
        fprintf(stderr, "preview-stream: save failed: %s\n", gp_result_as_string(ret));
        uint8_t header[5] = { MSG_CAPTURE_FAIL, 0, 0, 0, 0 };
        fwrite(header, 1, 5, stdout);
        fflush(stdout);
        return;
    }

    uint32_t path_len = (uint32_t)strlen(output_path);
    uint8_t header[5];
    header[0] = MSG_CAPTURE_OK;
    write_uint32_be(header + 1, path_len);
    fwrite(header, 1, 5, stdout);
    fwrite(output_path, 1, path_len, stdout);
    fflush(stdout);

    fprintf(stderr, "preview-stream: captured %s\n", output_path);
}

/* Check stdin for a capture command (non-blocking) */
static int check_stdin(char *buf, size_t bufsize) {
    fd_set fds;
    struct timeval tv = { 0, 0 };

    FD_ZERO(&fds);
    FD_SET(STDIN_FILENO, &fds);

    if (select(STDIN_FILENO + 1, &fds, NULL, NULL, &tv) > 0) {
        if (fgets(buf, bufsize, stdin) != NULL) {
            /* Strip newline */
            size_t len = strlen(buf);
            if (len > 0 && buf[len - 1] == '\n') buf[len - 1] = '\0';
            return 1;
        }
    }
    return 0;
}

int main(void) {
    Camera *camera = NULL;
    GPContext *context = NULL;
    int ret;

    signal(SIGTERM, handle_signal);
    signal(SIGINT, handle_signal);

    /* Make stdin non-blocking */
    int flags = fcntl(STDIN_FILENO, F_GETFL, 0);
    fcntl(STDIN_FILENO, F_SETFL, flags | O_NONBLOCK);

    context = gp_context_new();
    if (!context) {
        fprintf(stderr, "preview-stream: failed to create context\n");
        return 1;
    }

    ret = gp_camera_new(&camera);
    if (ret != GP_OK) {
        fprintf(stderr, "preview-stream: failed to create camera: %s\n", gp_result_as_string(ret));
        return 1;
    }

    ret = gp_camera_init(camera, context);
    if (ret != GP_OK) {
        fprintf(stderr, "preview-stream: failed to init camera: %s\n", gp_result_as_string(ret));
        gp_camera_free(camera);
        return 1;
    }

    fprintf(stderr, "preview-stream: connected to camera\n");

    char cmd_buf[4096];

    while (running) {
        /* Check for capture command */
        if (check_stdin(cmd_buf, sizeof(cmd_buf))) {
            if (strncmp(cmd_buf, "capture ", 8) == 0) {
                do_capture(camera, context, cmd_buf + 8);
            }
        }

        /* Stream preview frame */
        ret = send_preview_frame(camera, context);
        if (ret == -2) break;  /* stdout closed */
    }

    fprintf(stderr, "preview-stream: shutting down\n");
    gp_camera_exit(camera, context);
    gp_camera_free(camera);
    gp_context_unref(context);

    return 0;
}

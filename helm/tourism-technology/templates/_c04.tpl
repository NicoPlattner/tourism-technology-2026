{{/* Pod spec of the c04 refresh pipeline (Job and CronJobs); args: root, mode. */}}
{{- define "c04.pipelinePod" }}
      restartPolicy: Never
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        fsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: refresh
          image: {{ .root.Values.c04Pipeline.image }}
          imagePullPolicy: Always
          args: [{{ .mode | quote }}]
          env:
            - name: WORK_DIR
              value: /work
            - name: TTF_SPACE_API_KEY
              valueFrom:
                secretKeyRef:
                  name: {{ .root.Release.Name }}-ttf
                  key: TTF_SPACE_API_KEY
                  optional: true
          resources:
            requests:
              cpu: 100m
              memory: 512Mi
            limits:
              cpu: "1"
              memory: 3Gi
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: [ALL]
          volumeMounts:
            - name: work
              mountPath: /work
      volumes:
        - name: work
          persistentVolumeClaim:
            claimName: {{ .root.Release.Name }}-c04-data
{{- end }}

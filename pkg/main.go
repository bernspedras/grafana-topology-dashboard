package main

import (
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend/app"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/bernspedras/topology-dashboard-app/pkg/plugin"
)

func main() {
	if err := app.Manage("bernspedras-topology-dashboard-app", plugin.NewApp, app.ManageOpts{}); err != nil {
		log.DefaultLogger.Error("Error managing plugin", "error", err)
		os.Exit(1)
	}
}

import { Component, OnInit, OnDestroy } from '@angular/core';
import { WebSocketService } from '../../services/websocket.service';
import { SimulatorEvent } from '../../app.component';

@Component({
  selector: 'app-igas-display',
  templateUrl: './igas-display.component.html',
  styleUrls: ['./igas-display.component.scss']
})
export class IgasDisplayComponent implements OnInit, OnDestroy {
  currentIGas: number = 0.0;
  totalIGas: number = 0.0;
  private subscription: any;

  constructor(private wsService: WebSocketService) {}

  ngOnInit() {
    console.log('⛽ [iGasDisplay] Component initialized');

    this.subscription = this.wsService.events$.subscribe((event: SimulatorEvent) => {
      console.log(`⛽ [iGasDisplay] Received event: ${event.type}`, event);

      if (event.type === 'igas') {
        console.log(`⛽ [iGasDisplay] Processing iGas event:`, event.data);

        if (event.data?.igas !== undefined) {
          const rawValue = event.data.igas;
          console.log(`⛽ [iGasDisplay] Raw iGas value: ${rawValue} (type: ${typeof rawValue})`);

          const igasValue = typeof rawValue === 'string'
            ? parseFloat(rawValue)
            : Number(rawValue);

          if (!isNaN(igasValue)) {
            this.currentIGas = igasValue;
            this.totalIGas += igasValue;
            console.log(`⛽ [iGasDisplay] Updated iGas: current=${this.currentIGas}, total=${this.totalIGas}`);
          } else {
            console.error(`⛽ [iGasDisplay] Invalid iGas value: ${rawValue}`);
          }
        } else {
          console.warn(`⛽ [iGasDisplay] iGas event missing igas data:`, event.data);
        }
      }
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}


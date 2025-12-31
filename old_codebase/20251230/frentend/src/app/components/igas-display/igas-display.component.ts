import { Component, OnInit, OnDestroy } from '@angular/core';
import { WebSocketService } from '../../services/websocket.service';
import { SimulatorEvent } from '../../app.component';

@Component({
  selector: 'app-igas-display',
  templateUrl: './igas-display.component.html',
  styleUrls: ['./igas-display.component.scss']
})
export class IgasDisplayComponent implements OnInit, OnDestroy {
  currentIGas: number = 0;
  totalIGas: number = 0;
  private subscription: any;

  constructor(private wsService: WebSocketService) {}

  ngOnInit() {
    this.subscription = this.wsService.events$.subscribe((event: SimulatorEvent) => {
      if (event.type === 'igas' && event.data?.igas) {
        this.currentIGas = event.data.igas;
        this.totalIGas += event.data.igas;
      }
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}


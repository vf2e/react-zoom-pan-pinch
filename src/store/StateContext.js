import React, { Component } from "react";
import PropTypes from "prop-types";
import { reducer, initialState } from "./StateReducer";
import {
  SET_SCALE,
  SET_POSITION_X,
  SET_POSITION_Y,
  SET_WRAPPER,
  SET_CONTENT,
  SET_START_COORDS,
  SET_IS_DOWN,
  SET_DISTANCE,
} from "./CONSTANTS";
import {
  roundNumber,
  checkIsNumber,
  boundLimiter,
  relativeCoords,
  calculateBoundingArea,
  getMiddleCoords,
  getDistance,
} from "./utils";
import makePassiveEventOption from "./makePassiveEventOption";

const Context = React.createContext({});

class StateProvider extends Component {
  state = { ...initialState, ...this.props.defaultValues };

  componentDidMount() {
    const passiveOption = makePassiveEventOption(false);

    // Panning on window to allow panning when mouse is out of wrapper
    window.addEventListener("mousedown", this.handleStartPanning, passiveOption);
    window.addEventListener("mousemove", this.handlePanning, passiveOption);
    window.addEventListener("mouseup", this.handleStopPanning, passiveOption);
    return () => {
      window.removeEventListener("mousedown", this.handleStartPanning, passiveOption);
      window.removeEventListener("mousemove", this.handlePanning, passiveOption);
      window.removeEventListener("mouseup", this.handleStopPanning, passiveOption);
    };
  }

  componentDidUpdate(oldProps, oldState) {
    const { wrapperComponent } = this.state;
    if (!oldState.wrapperComponent && this.state.wrapperComponent) {
      // Zooming events on wrapper
      const passiveOption = makePassiveEventOption(false);
      wrapperComponent.addEventListener("wheel", this.handleZoom, passiveOption);
      wrapperComponent.addEventListener("dblclick", this.handleDbClick, passiveOption);
      wrapperComponent.addEventListener("touchstart", this.handlePinchStart, passiveOption);
      wrapperComponent.addEventListener("touchmove", this.handlePinch, passiveOption);
      wrapperComponent.addEventListener("touchend", this.handlePinchStop, passiveOption);
    }
  }

  //////////
  // Zooming
  //////////

  handleZoom = (event, setCenterClick, customDelta, customSensitivity) => {
    const {
      isDown,
      zoomingEnabled,
      disabled,
      wrapperComponent,
      contentComponent,
      positionX,
      positionY,
      scale,
      sensitivity,
      maxScale,
      minScale,
      enableZoomedOutPanning,
      limitToBounds,
    } = this.state;
    if (isDown || !zoomingEnabled || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const { x, y, wrapperWidth, wrapperHeight } = relativeCoords(
      event,
      wrapperComponent,
      contentComponent
    );

    const deltaY = event ? (event.deltaY < 0 ? 1 : -1) : 0;
    const delta = checkIsNumber(customDelta, deltaY);
    const zoomSensitivity = (customSensitivity || sensitivity) * 0.1;

    // Calculate new zoom
    let newScale = roundNumber(scale + delta * zoomSensitivity * scale, 2);

    if (!isNaN(maxScale) && newScale >= maxScale && scale < maxScale) {
      newScale = maxScale;
    }
    if (!isNaN(minScale) && newScale <= minScale && scale > minScale) {
      newScale = minScale;
    }
    if ((!isNaN(maxScale) && !isNaN(minScale) && newScale > maxScale) || newScale < minScale)
      return;

    const scaleDifference = newScale - scale;

    // Mouse position
    const mouseX = checkIsNumber(
      setCenterClick && setCenterClick.x,
      setCenterClick ? wrapperWidth / 2 : x
    );
    const mouseY = checkIsNumber(
      setCenterClick && setCenterClick.y,
      setCenterClick ? wrapperHeight / 2 : y
    );

    if (isNaN(mouseX) || isNaN(mouseY)) return console.warn("No mouse or touch offset found");

    // Determine new zoomed in point
    const newContentWidth = wrapperWidth * newScale;
    const newContentHeight = wrapperHeight * newScale;

    const newDiffWidth = wrapperWidth - newContentWidth;
    const newDiffHeight = wrapperHeight - newContentHeight;

    // Calculate bounding area
    const { minPositionX, maxPositionX, minPositionY, maxPositionY } = calculateBoundingArea(
      wrapperWidth,
      newContentWidth,
      newDiffWidth,
      wrapperHeight,
      newContentHeight,
      newDiffHeight,
      enableZoomedOutPanning
    );

    this.setScale(newScale);

    // Calculate new positions
    const newPositionX = -(mouseX * scaleDifference) + positionX;
    const newPositionY = -(mouseY * scaleDifference) + positionY;

    this.setPositionX(boundLimiter(newPositionX, minPositionX, maxPositionX, limitToBounds));
    this.setPositionY(boundLimiter(newPositionY, minPositionY, maxPositionY, limitToBounds));
  };

  //////////
  // Panning
  //////////

  handleStartPanning = event => {
    const {
      isDown,
      panningEnabled,
      disabled,
      wrapperComponent,
      contentComponent,
      positionX,
      positionY,
    } = this.state;
    const { target } = event;
    if (
      isDown ||
      !panningEnabled ||
      disabled ||
      !wrapperComponent.contains(target) ||
      (event.touches && event.touches.length !== 1)
    )
      return;
    let points;
    if (!event.touches) {
      points = relativeCoords(event, wrapperComponent, contentComponent, true);
    } else {
      points = getMiddleCoords(event.touches[0], event.touches[0], wrapperComponent);
    }
    this.setStartCoords({
      x: points.x - positionX,
      y: points.y - positionY,
    });
    this.setIsDown(true);
  };

  handlePanning = event => {
    const {
      isDown,
      panningEnabled,
      disabled,
      wrapperComponent,
      contentComponent,
      startCoords,
      enableZoomedOutPanning,
      limitToBounds,
    } = this.state;
    if (!isDown || !panningEnabled || disabled || (event.touches && event.touches.length !== 1))
      return;
    const {
      x,
      y,
      wrapperWidth,
      wrapperHeight,
      contentWidth,
      contentHeight,
      diffWidth,
      diffHeight,
    } = relativeCoords(event, wrapperComponent, contentComponent, true);
    const newPositionX = x - startCoords.x;
    const newPositionY = y - startCoords.y;

    // Calculate bounding area
    const { minPositionX, maxPositionX, minPositionY, maxPositionY } = calculateBoundingArea(
      wrapperWidth,
      contentWidth,
      diffWidth,
      wrapperHeight,
      contentHeight,
      diffHeight,
      enableZoomedOutPanning
    );

    this.setPositionX(boundLimiter(newPositionX, minPositionX, maxPositionX, limitToBounds));
    this.setPositionY(boundLimiter(newPositionY, minPositionY, maxPositionY, limitToBounds));
  };

  handleStopPanning = () => {
    this.setIsDown(false);
  };

  //////////
  // Pinching
  //////////

  handlePinchStart = event => {
    this.handleStartPanning(event);
    event.preventDefault();
    event.stopPropagation();
  };

  handlePinch = event => {
    const { distance, pinchSensitivity, pinchEnabled, disabled, wrapperComponent } = this.state;
    this.handlePanning(event);
    if (event.touches.length >= 2) {
      this.handleStopPanning();
    }
    if (pinchEnabled && event.touches.length >= 2 && !disabled) {
      let length = getDistance(event.touches[0], event.touches[1]);
      this.setDistance(length);
    }
    if (isNaN(distance) || event.touches.length !== 2 || !pinchEnabled || disabled) return;
    let length = getDistance(event.touches[0], event.touches[1]);
    this.handleZoom(
      event,
      getMiddleCoords(event.touches[0], event.touches[1], wrapperComponent),
      distance < length ? 1 : -1,
      pinchSensitivity
    );
  };

  handlePinchStop = () => {
    const { distance } = this.state;
    this.handleStopPanning();
    if (!isNaN(distance)) {
      this.setDistance(false);
    }
  };

  //////////
  // Controls
  //////////

  zoomIn = event => {
    const { zoomingEnabled, disabled, zoomInSensitivity } = this.state;
    if (!zoomingEnabled || disabled) return;
    this.handleZoom(event, true, 1, zoomInSensitivity);
  };

  zoomOut = event => {
    const { zoomingEnabled, disabled, zoomOutSensitivity } = this.state;
    if (!zoomingEnabled || disabled) return;
    this.handleZoom(event, true, -1, zoomOutSensitivity);
  };

  handleDbClick = event => {
    const { zoomingEnabled, disabled, dbClickSensitivity } = this.state;
    if (!zoomingEnabled || disabled) return;
    //todo debug
    this.handleZoom(event, false, 1, dbClickSensitivity);
  };

  setScale = scale => {
    this.setState(state => reducer(state, { type: SET_SCALE, scale: scale }));
  };

  setPositionX = positionX => {
    this.setState(state =>
      reducer(state, { type: SET_POSITION_X, positionX: roundNumber(positionX, 3) })
    );
  };

  setPositionY = positionY => {
    this.setState(state =>
      reducer(state, { type: SET_POSITION_Y, positionY: roundNumber(positionY, 3) })
    );
  };

  setTransform = (positionX, positionY, scale) => {
    !isNaN(scale) && this.setScale(scale);
    !isNaN(positionX) && this.setPositionX(positionX);
    !isNaN(positionY) && this.setPositionY(positionY);
  };

  resetTransform = (defaultScale, defaultPositionX, defaultPositionY) => {
    this.setScale(checkIsNumber(defaultScale, initialState.scale));
    this.setPositionX(checkIsNumber(defaultPositionX, initialState.positionX));
    this.setPositionY(checkIsNumber(defaultPositionY, initialState.positionY));
  };

  //////////
  // Setters
  //////////

  setStartCoords = startCoords => {
    this.setState(state => reducer(state, { type: SET_START_COORDS, startCoords: startCoords }));
  };

  setIsDown = isDown => {
    this.setState(state => reducer(state, { type: SET_IS_DOWN, isDown: isDown }));
  };

  setDistance = distance => {
    this.setState(state => reducer(state, { type: SET_DISTANCE, distance: distance }));
  };

  setWrapperComponent = wrapperComponent => {
    this.setState(state =>
      reducer(state, { type: SET_WRAPPER, wrapperComponent: wrapperComponent })
    );
  };

  setContentComponent = contentComponent => {
    this.setState(state =>
      reducer(state, { type: SET_CONTENT, contentComponent: contentComponent })
    );
  };

  render() {
    /**
     * Context provider value
     */
    const value = {
      state: {
        positionX: this.state.positionX,
        positionY: this.state.positionY,
        scale: this.state.scale,
        sensitivity: this.state.sensitivity,
        maxScale: this.state.maxScale,
        minScale: this.state.minScale,
        minPositionX: this.state.minPositionX,
        minPositionY: this.state.minPositionY,
        maxPositionX: this.state.maxPositionX,
        maxPositionY: this.state.maxPositionY,
        limitToBounds: this.state.limitToBounds,
        zoomingEnabled: this.state.zoomingEnabled,
        panningEnabled: this.state.panningEnabled,
        transformEnabled: this.state.transformEnabled,
        pinchEnabled: this.state.pinchEnabled,
        enableZoomedOutPanning: this.state.enableZoomedOutPanning,
        disabled: this.state.disabled,
        zoomOutSensitivity: this.state.zoomOutSensitivity,
        zoomInSensitivity: this.state.zoomInSensitivity,
        dbClickSensitivity: this.state.dbClickSensitivity,
        pinchSensitivity: this.state.pinchSensitivity,
        dbClickEnabled: this.state.dbClickEnabled,
      },
      dispatch: {
        setScale: this.setScale,
        setPositionX: this.setPositionX,
        setPositionY: this.setPositionY,
        zoomIn: this.zoomIn,
        zoomOut: this.zoomOut,
        setTransform: this.setTransform,
        resetTransform: this.resetTransform,
      },
      nodes: {
        setWrapperComponent: this.setWrapperComponent,
        setContentComponent: this.setContentComponent,
      },
      internal: {
        handleZoom: this.handleZoom,
        handleStartPanning: this.handleStartPanning,
        handlePanning: this.handlePanning,
        handleStopPanning: this.handleStopPanning,
        handleDbClick: this.handleDbClick,
        handlePinchStart: this.handlePinchStart,
        handlePinch: this.handlePinch,
        handlePinchStop: this.handlePinchStop,
      },
    };
    const { children } = this.props;
    const content =
      typeof children === "function" ? children({ ...value.state, ...value.dispatch }) : children;

    return <Context.Provider value={value}>{content}</Context.Provider>;
  }
}

StateProvider.defaultProps = {
  defaultValues: {},
};

StateProvider.propTypes = {
  children: PropTypes.any,
  defaultValues: PropTypes.object,
};

export { Context, StateProvider };
